export class MemoriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoriError";
  }
}

export class VectorStoreError extends MemoriError {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = "VectorStoreError";
  }
}

export class EmbeddingError extends MemoriError {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export class ConfigurationError extends MemoriError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
