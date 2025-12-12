/**
 * Represents a retrieved memory from the vector store.
 * This object contains the stored content, its vector representation, associated metadata, and the similarity score.
 */
export interface MemoryResult {
  /** Unique identifier for the memory record */
  id: string;
  /** The actual text content of the memory */
  content: string;
  /** The vector embedding representing the semantic meaning of the content */
  embedding: number[];
  /** Optional metadata attached to this memory (e.g., timestamps, source info) */
  metadata: MemoryMetadata | null;
  /** The similarity distance score. Lower values usually mean strictly closer (depending on metric used). */
  distance: number;
}

/**
 * Flexible metadata structure for memories.
 * Allows storing arbitrary key-value pairs along with standard fields like role and timestamps.
 */
export interface MemoryMetadata {
  /** The role of the creator of this memory (e.g., 'user', 'assistant') */
  role?: string;
  /** ID of the entity (user/agent) this memory belongs to */
  entityId?: string;
  /** ID of the specific process or context */
  processId?: string;
  /** ID of the session this memory was created in */
  sessionId?: string;
  /** ISO timestamp string of creation */
  created_at?: string;
  /** Allow dynamic properties for flexibility */
  [key: string]: any;
}

/**
 * Filter criteria for memory searches.
 * exact match filters to narrow down the search scope.
 */
export interface MemoryFilter {
  /** If provided, only returns memories matching this entityId */
  entityId?: string;
  /** If provided, only returns memories matching this processId */
  processId?: string;
  /** If provided, only returns memories matching this sessionId */
  sessionId?: string;
}

/**
 * Standard interface that all vector store implementations (SQLite, Postgres, etc.) must adhere to.
 * This abstraction allows swapping the underlying database without changing application logic.
 */
export interface VectorStore {
  /**
   * Initializes the database connection and ensures necessary tables/indexes exist.
   * This must be called before performing any other operations.
   */
  init(): Promise<void>;

  /**
   * Inserts a new vector record into the store.
   * @param content - The raw text content to be stored.
   * @param embedding - The vector embedding of the content (array of numbers).
   * @param metadata - Optional metadata identifying the source/context of this memory.
   * @returns A promise resolving to the ID of the inserted record.
   */
  insert(
    content: string,
    embedding: number[],
    metadata?: MemoryMetadata
  ): Promise<string>;

  /**
   * Searches for vectors similar to the query embedding.
   * @param embedding - The query vector to compare against.
   * @param limit - The maximum number of results to return.
   * @param filter - Optional criteria to filter results by (e.g., entityId).
   * @returns A promise resolving to an array of sorted MemoryResult objects.
   */
  search(
    embedding: number[],
    limit: number,
    filter?: MemoryFilter
  ): Promise<MemoryResult[]>;

  /**
   * Closes the database connection and cleans up resources.
   * Should be called when the application is shutting down.
   */
  close(): Promise<void>;
}

/**
 * Interface for embedding providers.
 * Allows users to supply their own embedding logic (e.g. OpenAI, Google, CoHere, locally).
 */
export interface EmbeddingProvider {
  /**
   * Generates a vector embedding for the given text.
   * @param text - The text to embed.
   * @returns A promise resolving to the vector embedding (array of numbers).
   */
  embed(text: string): Promise<number[]>;
}
