export interface MemoryResult {
  id: string;
  content: string;
  embedding: number[];
  metadata: MemoryMetadata | null;
  distance: number;
}

export interface MemoryMetadata {
  role?: string;
  entityId?: string;
  processId?: string;
  sessionId?: string;
  created_at?: string;
  [key: string]: any;
}

export interface MemoryFilter {
  entityId?: string;
  processId?: string;
  sessionId?: string;
}

export interface VectorStore {
  /**
   * Initialize the database connection and tables
   */
  init(): Promise<void>;

  /**
   * Insert a vector into the store
   */
  insert(
    content: string,
    embedding: number[],
    metadata?: MemoryMetadata
  ): Promise<string>;

  /**
   * Search for similar vectors
   */
  search(
    embedding: number[],
    limit: number,
    filter?: MemoryFilter
  ): Promise<MemoryResult[]>;

  /**
   * Close the connection
   */
  close(): Promise<void>;
}
