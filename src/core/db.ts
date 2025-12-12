// Re-export for backward compatibility
import { SqliteVecStore } from "../stores/sqlite";

/**
 * Legacy wrapper for SqliteVecStore.
 * Maintained for backward compatibility. New users should prefer `SqliteVecStore` directly
 * or use the generic `vectorStore` configuration options.
 *
 * @deprecated Use SqliteVecStore directly.
 */
export class MemoriDB extends SqliteVecStore {
  /**
   * @param path - Optional file path for the SQLite database. Defaults to :memory: if not provided.
   */
  constructor(path?: string) {
    super(path);
    // Log deprecation warning if needed
    // console.warn("MemoriDB is deprecated. Use SqliteVecStore or the 'vectorStore' option in common config.");
  }
}
