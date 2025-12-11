// Re-export for backward compatibility
import { SqliteVecStore } from "../stores/sqlite";

export class MemoriDB extends SqliteVecStore {
  constructor(path?: string) {
    super(path);
    // Log deprecation warning if needed
    // console.warn("MemoriDB is deprecated. Use SqliteVecStore or the 'vectorStore' option in common config.");
  }
}
