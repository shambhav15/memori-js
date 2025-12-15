# Introducing memori-js: The SQL-Native AI Memory Fabric for JavaScript

**Date:** December 16, 2024
**Author:** Shambhav

## What is memori-js?

`memori-js` is not just another vector database wrapper. It is an **active memory layer** designed specifically for AI agents in JavaScript and TypeScript. It lives inside your application, automatically managing context for your Large Language Models (LLMs) without the complexity of building manual Retrieval-Augmented Generation (RAG) pipelines.

Unlike traditional setups where you have to manually chunk text, generate embeddings, query a vector database, and inject context into your system prompt, `memori-js` handles this entire lifecycle for you.

## Why I Built This

If you are building an AI app today, the standard workflow usually looks like this:

1. Set up a heavy vector database (Pinecone, Qdrant, etc.).
2. Write a pipeline to chunk and embed user input.
3. Query the DB before every LLM call.
4. Manually format and inject that context.
5. Save the new conversation back to the DB.

This is a lot of boilerplate code that detracts from the actual product logic. **Memory should be invisible.** With `memori-js`, I wanted to create a "Zero-Config" experience where you can just write:

```typescript
memori.llm.register(client);
```

...and your LLM instantly has long-term memory.

## Key Features

### 1. 🔌 Provider Agnostic

The library is designed to clear the vendor lock-in hurdles. It works seamlessly with **OpenAI**, **Google GenAI**, and **Anthropic**. The architecture allows you to swap "brains" (embedding providers) without rewriting your application logic.

### 2. ⚡ SQL-Native & Cloud Ready

By default, it runs on a local `sqlite-vec` instance—perfect for development and embedded apps. However, it is built to scale. With a single line of config, you can switch to **Postgres** (Supabase, Neon) using `pgvector` for production workloads.

### 3. 🛡️ Enterprise Quality

I prioritized reliability and developer experience. The library includes:

- **Arktype** for ultra-fast, strict runtime validation.
- **Structured Logging** for debugging.
- **Zero-Shot RAG**: New conversations automatically benefit from past context.

### 4. 🧠 Advanced Augmentation (Multi-Tenancy)

For complex multi-user applications, `memori-js` supports deep context attribution. You can scope memories to specific Users, Agents, or Sessions, ensuring that data doesn't leak between tenants.

---

# Version History & Improvements (v1.0.5+)

Here is a summary of the journey and improvements made to the library since version 1.0.5.

### v1.0.60: Robust Auto-Detection

- **Fix:** Improved the robustness of the OpenAI provider auto-detection.
- **Feature:** Added a resilient local fallback mechanism. If no API key is detected or the provider fails, the system attempts to degrade gracefully rather than crashing.

### v1.0.59: Enhanced Auto-Detection logic

- **Improvement:** Refined the logic for automatically detecting which embedding provider to use based on the available environment variables and configuration.

### v1.0.57: The "Enterprise" Refactor

- **Major Feature (Advanced Augmentation):** This was a massive update. I introduced the support for attribution metadata (`entityId`, `processId`, `sessionId`).
- **Database Schema Update:** Modified both SQLite and Postgres schemas to support these new metadata columns, enabling filtered searches (e.g., "Find memories ONLY for User X").
- **Refactor:** Cleaned up the internal architecture to better support these scoped operations.

### v1.0.56 & v1.0.55: Maintenance

- **Internal:** Minor bug fixes and dependency updates to ensure stability following the large refactor.

### v1.0.54: Multi-Provider Support & Stats

- **Feature:** Officially added support for multiple providers, allowing users to switch between OpenAI and Google seamlessly.
- **Feature:** Added `ExecutionStats` to the response, giving developers visibility into how retrieval performance (latency, chunks retrieved).

### v1.0.51 - v1.0.53: Documentation & Reliability

- **Docs:** A significant push on documentation, explaining how to connect to different databases and improving the JSDoc comments for better IntelliSense support.
- **Fix:** Resolved build and type definition issues that were affecting TypeScript users.
