import sqlite3 from "sqlite3";
import { join } from "path";
import {
  VectorStore,
  MemoryMetadata,
  MemoryResult,
  MemoryFilter,
} from "../core/types";
import { Logger, ConsoleLogger } from "../core/logger";
import { VectorStoreError } from "../core/errors";

/**
 * Implementation of VectorStore using SQLite and the sqlite-vec extension.
 * This provides a local, file-based vector database without needing external services.
 */
export class SqliteVecStore implements VectorStore {
  public db: sqlite3.Database;
  private dbPath: string;
  private logger: Logger;

  /**
   * @param path - File path for the database. Defaults to "memori.db". Use ":memory:" for ephemeral storage.
   * @param logger - Logger instance.
   */
  constructor(path = "memori.db", logger?: Logger) {
    this.dbPath = path;
    this.logger = logger || new ConsoleLogger();
    // We do NOT initialize in constructor anymore to match async init() pattern
    // But sqlite3 sync constructor is fine, we just move "init logic" to init()
    this.db = new sqlite3.Database(this.dbPath);
  }

  /**
   * Initializes the database schema and loads the vector extension.
   * This sets up two tables:
   * 1. `memories`: Stores raw text content and metadata.
   * 2. `vec_memories`: Virtual table for vector storage and search.
   */
  async init(): Promise<void> {
    this.loadExtension();
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Enable Write-Ahead Logging for better concurrency
        this.db.run("PRAGMA journal_mode = WAL;");

        // 2. Create Vector Virtual Table (vec0)
        // supporting 768 dimensions (Google text-embedding-004 standard)
        this.db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
              embedding float[768]
            );
          `);

        // Standard relational table for content and metadata
        this.db.run(`
            CREATE TABLE IF NOT EXISTS memories (
              rowid INTEGER PRIMARY KEY AUTOINCREMENT,
              content TEXT,
              role TEXT,
              entity_id TEXT,
              process_id TEXT,
              session_id TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
          `);

        // Cleanup trigger: Automatically delete vector when metadata row is deleted
        this.db.run(
          `
            CREATE TRIGGER IF NOT EXISTS delete_vec_memory
            AFTER DELETE ON memories
            BEGIN
              DELETE FROM vec_memories WHERE rowid = old.rowid;
            END;
          `,
          (err) => {
            if (err)
              reject(
                new VectorStoreError("Failed to init SQLite trigger", err)
              );
            else resolve();
          }
        );
      });
    });
  }

  /**
   * Dynamically loads the platform-specific sqlite-vec extension.
   * This allows the library to work on Mac, Linux, and Windows without manual setup.
   */
  private loadExtension() {
    // Determine platform-specific package name
    let packageName = "";
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "darwin") {
      packageName =
        arch === "arm64" ? "sqlite-vec-darwin-arm64" : "sqlite-vec-darwin-x64";
    } else if (platform === "linux") {
      packageName = "sqlite-vec-linux-x64-gnu";
    } else if (platform === "win32") {
      packageName = "sqlite-vec-win32-x64";
    } else {
      this.logger.warn(
        "Unsupported platform for sqlite-vec auto-loading: " + platform
      );
      return;
    }

    try {
      let fileExt = ".dylib";
      if (platform === "linux") fileExt = ".so";
      if (platform === "win32") fileExt = ".dll";

      // Construct path to the binary in node_modules
      const finalPath = join(
        process.cwd(),
        "node_modules",
        packageName,
        `vec0${fileExt}`
      );

      this.db.loadExtension(finalPath, (err) => {
        if (err) {
          this.logger.error(
            `Failed to load sqlite-vec extension from ${packageName}:`,
            err
          );
        }
      });
    } catch (e) {
      this.logger.error("Could not find/load sqlite-vec extension:", e);
    }
  }

  /**
   * Inserts a new memory and its vector embedding.
   * Uses a transaction to ensure both tables are updated atomically.
   */
  async insert(
    content: string,
    embedding: number[],
    metadata?: MemoryMetadata
  ): Promise<string> {
    const role = metadata?.role || "user";
    const entityId = metadata?.entityId || null;
    const processId = metadata?.processId || null;
    const sessionId = metadata?.sessionId || null;

    return new Promise((resolve, reject) => {
      const db = this.db;
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        let rowid: number;

        // 1. Insert Metadata
        db.run(
          "INSERT INTO memories (content, role, entity_id, process_id, session_id) VALUES (?, ?, ?, ?, ?)",
          [content, role, entityId, processId, sessionId],
          function (err) {
            if (err) {
              db.run("ROLLBACK");
              return reject(
                new VectorStoreError("Failed to insert metadata", err)
              );
            }
            // @ts-ignore
            rowid = this.lastID;

            // 2. Insert Vector
            // Must convert array to Float32Array buffer for sqlite-vec
            const buffer = Buffer.from(new Float32Array(embedding).buffer);

            db.run(
              "INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)",
              [rowid, buffer],
              function (err) {
                if (err) {
                  db.run("ROLLBACK");
                  return reject(
                    new VectorStoreError("Failed to insert embeddings", err)
                  );
                }

                db.run("COMMIT", (err) => {
                  if (err)
                    reject(
                      new VectorStoreError("Failed to commit transaction", err)
                    );
                  else resolve(rowid.toString());
                });
              }
            );
          }
        );
      });
    });
  }

  /**
   * Searches for similar memories using KNN vector search.
   * Can be filtered by entity, process, or session IDs.
   */
  async search(
    embedding: number[],
    limit = 5,
    filter?: MemoryFilter
  ): Promise<MemoryResult[]> {
    // Basic vector search clause
    let whereClause = "v.embedding MATCH ? AND k = ?";
    const params: any[] = [
      Buffer.from(new Float32Array(embedding).buffer),
      limit,
    ];

    // Append standard SQL filters if provided
    if (filter?.entityId) {
      whereClause += " AND m.entity_id = ?";
      params.push(filter.entityId);
    }
    if (filter?.processId) {
      whereClause += " AND m.process_id = ?";
      params.push(filter.processId);
    }
    if (filter?.sessionId) {
      whereClause += " AND m.session_id = ?";
      params.push(filter.sessionId);
    }

    const query = `
        SELECT 
            m.rowid,
            m.content,
            m.created_at,
            m.role,
            m.entity_id,
            m.process_id,
            m.session_id,
            v.distance
        FROM vec_memories v
        JOIN memories m ON v.rowid = m.rowid
        WHERE ${whereClause}
        ORDER BY v.distance
      `;

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows: any[]) => {
        if (err) reject(new VectorStoreError("Search query failed", err));
        else {
          const results: MemoryResult[] = rows.map((r) => ({
            id: r.rowid.toString(),
            content: r.content,
            embedding: [], // Optimization: don't return embedding unless asked to save bandwidth
            distance: r.distance,
            metadata: {
              role: r.role,
              created_at: r.created_at,
              entityId: r.entity_id,
              processId: r.process_id,
              sessionId: r.session_id,
            },
          }));
          resolve(results);
        }
      });
    });
  }

  async delete(id: string): Promise<void> {
    // Trigger handles vec deletion, just delete metadata row
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM memories WHERE rowid = ?", [id], (err) => {
        if (err)
          reject(new VectorStoreError(`Failed to delete memory ${id}`, err));
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(new VectorStoreError("Failed to close DB", err));
        else resolve();
      });
    });
  }
}
