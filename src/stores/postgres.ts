import { Pool, PoolConfig } from "pg";
import {
  VectorStore,
  MemoryResult,
  MemoryMetadata,
  MemoryFilter,
} from "../core/types";
import { VectorStoreError, ConfigurationError } from "../core/errors";

export class PostgresVecStore implements VectorStore {
  private pool: Pool;
  private tableName: string;

  constructor(connectionString: string, tableName = "memories") {
    if (!connectionString) {
      throw new ConfigurationError("Postgres connection string is required.");
    }
    this.pool = new Pool({
      connectionString,
    });
    this.tableName = tableName;
  }

  async init(): Promise<void> {
    try {
      const client = await this.pool.connect();
      try {
        // 1. Enable pgvector extension
        await client.query("CREATE EXTENSION IF NOT EXISTS vector");

        // 2. Create Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id SERIAL PRIMARY KEY,
            content TEXT,
            metadata JSONB,
            embedding vector(768),
            entity_id TEXT,
            process_id TEXT,
            session_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 3. Create HNSW Index for fast ANN search
        // Check if index exists or rely on idempotent creation commands if supported,
        // but explicit named index creation IF NOT EXISTS is trickier in older PG.
        // We'll use a simple approach:
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx 
          ON ${this.tableName} 
          USING hnsw (embedding vector_cosine_ops)
        `);
      } finally {
        client.release();
      }
    } catch (e) {
      throw new VectorStoreError("Failed to initialize PostgresVecStore", e);
    }
  }

  async insert(
    content: string,
    embedding: number[],
    metadata: MemoryMetadata = {}
  ): Promise<string> {
    try {
      // pgvector requires array string format '[1,2,3]'
      const embeddingStr = JSON.stringify(embedding);
      const { entityId, processId, sessionId } = metadata;

      const res = await this.pool.query(
        `INSERT INTO ${this.tableName} (content, embedding, metadata, entity_id, process_id, session_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [content, embeddingStr, metadata, entityId, processId, sessionId]
      );

      return res.rows[0].id.toString();
    } catch (e) {
      throw new VectorStoreError("Failed to insert memory into Postgres", e);
    }
  }

  async search(
    embedding: number[],
    limit = 5,
    filter?: MemoryFilter
  ): Promise<MemoryResult[]> {
    try {
      const embeddingStr = JSON.stringify(embedding);
      let whereClause = "1=1";
      const params: any[] = [embeddingStr, limit];
      let paramIndex = 3;

      if (filter?.entityId) {
        whereClause += ` AND entity_id = $${paramIndex++}`;
        params.push(filter.entityId);
      }
      if (filter?.processId) {
        whereClause += ` AND process_id = $${paramIndex++}`;
        params.push(filter.processId);
      }
      if (filter?.sessionId) {
        whereClause += ` AND session_id = $${paramIndex++}`;
        params.push(filter.sessionId);
      }

      const query = `
        SELECT 
            id, 
            content, 
            metadata, 
            entity_id,
            process_id,
            session_id,
            created_at, 
            (embedding <=> $1) as distance 
        FROM ${this.tableName}
        WHERE ${whereClause}
        ORDER BY distance ASC
        LIMIT $2
      `;

      const res = await this.pool.query(query, params);

      return res.rows.map((row) => ({
        id: row.id.toString(),
        content: row.content,
        embedding: [], // Optimize bandwidth
        metadata: {
          ...row.metadata,
          created_at: row.created_at,
          entityId: row.entity_id,
          processId: row.process_id,
          sessionId: row.session_id,
        },
        distance: row.distance,
      }));
    } catch (e) {
      throw new VectorStoreError("Failed to search memories in Postgres", e);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [
        id,
      ]);
    } catch (e) {
      throw new VectorStoreError(`Failed to delete memory ${id}`, e);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
