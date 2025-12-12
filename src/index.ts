/**
 * Memori-JS: SQL-Native AI Memory Fabric
 *
 * Main entry point for the library.
 * Exports the core Memori class, vector stores (SQLite, Postgres), and utility types.
 *
 * @packageDocumentation
 */

// Core Logic
export * from "./core/memory";

// Legacy DB wrapper
export * from "./core/db";

// Elysia/Web Plugin
export * from "./plugin";

// Vector Store Implementations
export * from "./stores/postgres";
export * from "./stores/sqlite";

// Types and Interfaces
export * from "./core/types";

// Error Handling
export * from "./core/errors";

// Embedding Providers
export * from "./embeddings";

// Logging
export * from "./core/logger";

// We do not auto-start server anymore as per SDK design
