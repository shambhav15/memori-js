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
    // Try loading from installed node_modules package
    const extensionPath = join(
      process.cwd(),
      "node_modules",
      "sqlite-vec-darwin-arm64",
      "vec0.dylib"
    );
    // sqlite3 loadExtension requires string
    this.db.loadExtension(extensionPath, (err) => {
      if (err) {
        console.error("Failed to load sqlite-vec extension:", err);
      }
    });
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
