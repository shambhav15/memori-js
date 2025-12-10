import { Elysia } from "elysia";
import { Memori, MemoriOptions } from "./core/memory";
import { createMemoriProxy } from "./core/proxy";
import OpenAI from "openai";

export const memoriPlugin =
  (options: MemoriOptions = {}) =>
  (app: Elysia) => {
    // Initialize single instance
    const memori = new Memori(options);

    return app.decorate("memori", memori).derive(({ memori }) => {
      return {
        // Helper to wrap a client on the fly
        withMemory: (client: OpenAI) => createMemoriProxy(client, memori),
      };
    });
  };

// Re-export core
export * from "./core/memory";
export * from "./core/db";
export * from "./core/proxy";
