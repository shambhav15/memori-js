import sqlite3 from "sqlite3";
import { join } from "path";

export class MemoriDB {
  public db: sqlite3.Database;

  constructor(path = "memori.db") {
    // verbose mode for debugging
    this.db = new sqlite3.Database(path);
    this.loadExtension();
    this.init();
  }

  private loadExtension() {
    // Determine platform-specific package name
    let packageName = "";
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "darwin") {
      packageName =
        arch === "arm64" ? "sqlite-vec-darwin-arm64" : "sqlite-vec-darwin-x64";
    } else if (platform === "linux") {
      packageName = "sqlite-vec-linux-x64-gnu"; // Assumes gnu. musl could be detected too.
    } else if (platform === "win32") {
      packageName = "sqlite-vec-win32-x64";
    } else {
      console.warn(
        "Unsupported platform for sqlite-vec auto-loading: " + platform
      );
      return;
    }

    try {
      const extensionPath = join(
        process.cwd(),
        "node_modules",
        packageName,
        "vec0.dylib" // Note: This filename might vary by OS (.so, .dll).
        // However, the node-sqlite3 wrapper often handles platform specifics or uses a standard entry.
        // Actually, sqlite-vec packages usually expose the binary.
        // Let's refine the path logic based on common npm layout or just verify what's inside.
        // For macOS it is vec0.dylib. For Linux .so, Windows .dll.
      );

      let fileExt = ".dylib";
      if (platform === "linux") fileExt = ".so";
      if (platform === "win32") fileExt = ".dll";

      const finalPath = join(
        process.cwd(),
        "node_modules",
        packageName,
        `vec0${fileExt}`
      );

      this.db.loadExtension(finalPath, (err) => {
        if (err) {
          // Warning only, as it might already be loaded or user environment issue
          console.error(
            `Failed to load sqlite-vec extension from ${packageName}:`,
            err
          );
        }
      });
    } catch (e) {
      console.error("Could not find/load sqlite-vec extension:", e);
    }
  }

  private init() {
    this.db.serialize(() => {
      this.db.run("PRAGMA journal_mode = WAL;");
      // 2. Create Vector Virtual Table (vec0)
      // supporting 768 dimensions (Google text-embedding-004 standard)
      this.db.run(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
            embedding float[768]
          );
        `);
      this.db.run(`
          CREATE TABLE IF NOT EXISTS memories (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            role TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      this.db.run(`
          CREATE TRIGGER IF NOT EXISTS delete_vec_memory
          AFTER DELETE ON memories
          BEGIN
            DELETE FROM vec_memories WHERE rowid = old.rowid;
          END;
        `);
    });
  }

  async insert(
    content: string,
    embedding: number[],
    role = "user"
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = this.db;
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        let rowid: number;

        // 1. Metadata
        db.run(
          "INSERT INTO memories (content, role) VALUES (?, ?)",
          [content, role],
          function (err) {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }
            // @ts-ignore
            rowid = this.lastID;

            // 2. Vector
            // sqlite3 uses Buffer for float arrays usually
            const buffer = Buffer.from(new Float32Array(embedding).buffer);

            db.run(
              "INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)",
              [rowid, buffer],
              function (err) {
                if (err) {
                  db.run("ROLLBACK");
                  return reject(err);
                }

                db.run("COMMIT", (err) => {
                  if (err) reject(err);
                  else resolve(rowid);
                });
              }
            );
          }
        );
      });
    });
  }

  async search(embedding: number[], limit = 5): Promise<any[]> {
    const query = `
        SELECT 
            m.rowid,
            m.content,
            m.created_at,
            v.distance
        FROM vec_memories v
        JOIN memories m ON v.rowid = m.rowid
        WHERE v.embedding MATCH ?
        AND k = ?
        ORDER BY v.distance
      `;

    return new Promise((resolve, reject) => {
      // sqlite3 expects Buffer
      const buffer = Buffer.from(new Float32Array(embedding).buffer);
      this.db.all(query, [buffer, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}
