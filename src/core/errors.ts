/**
 * Base error class for all Memori-related exceptions.
 * All specific errors thrown by this library inherit from this class.
 */
export class MemoriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoriError";
  }
}

/**
 * Thrown when an operation on the vector store fails (e.g., database connection issues, query errors).
 */
export class VectorStoreError extends MemoriError {
  /**
   * @param message - Descriptive error message.
   * @param originalError - The underlying error that caused this exception (optional).
   */
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = "VectorStoreError";
  }
}

/**
 * Thrown when generating embeddings fails (e.g., API rate limits, network errors).
 */
export class EmbeddingError extends MemoriError {
  /**
   * @param message - Descriptive error message.
   * @param originalError - The underlying error from the embedding provider (optional).
   */
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Thrown when the configuration is invalid or missing required fields (e.g., missing API keys).
 */
export class ConfigurationError extends MemoriError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
