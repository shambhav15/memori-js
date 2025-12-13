# Memori-JS Master Configuration & Usage Guide

This guide provides a comprehensive overview of how to configure, customize, and use `memori-js`. It covers everything from basic setup to deep customization.

## Table of Contents

1. [Configuration Options](#1-configuration-options)
2. [End-to-End Workflow](#2-end-to-end-workflow)
3. [Custom Embedding Providers](#3-custom-embedding-providers)
4. [Master Configuration Example](#4-master-configuration-example)

---

## 1. Configuration Options

The `Memori` class accepts a flexible configuration object.

```typescript
const memori = new Memori({
  // OPTIONAL: Your embedding API Key (Google/OpenAI/etc)
  // Defaults to process.env.MEMORI_API_KEY if not provided.
  apiKey: "str...",

  // OPTIONAL: Custom Embedding Provider (The "Brain")
  // Defaults to GoogleGenAIEmbedding if not provided.
  embedding: new MyCustomEmbedding(),

  // OPTIONAL: Dimension of the vectors
  // Defaults to 768. Set to 1536 for OpenAI, 384 for simple transformers, etc.
  embeddingDimension: 768,

  // OPTIONAL: Custom Database (The "Hard Drive")
  // Defaults to SqliteVecStore (local file). Can be PostgresVecStore.
  vectorStore: new PostgresVecStore(...),

  // OPTIONAL: Path for the local SQLite database
  // Defaults to "memori.db". Use ":memory:" for RAM-only.
  dbPath: "./my-db.sqlite",

  // OPTIONAL: Custom Logger
  // Defaults to ConsoleLogger.
  logger: myLogger
});
```

---

## 2. End-to-End Workflow

Memori acts as a middleware between your user and the LLM.

### The Flow

1.  **Retrieval (Read):** User sends a message -> Memori searches DB for relevant past context.
2.  **Injection (Inject):** Memori (or you) pastes this context into the System Prompt.
3.  **Generation:** LLM answers the user based on context.
4.  **Storage (Write):** Memori saves your User/AI turn into the database for future recall.

### Code Example (Manual Mode)

This works with **ANY** LLM (Llama, Mistral, Grok, etc).

```typescript
// 1. Ask Memori what we know
const context = await memori.retrieveContext(userMessage);

// 2. Add to your System Prompt
const prompt = `System: Here is what we know about the user:\n${context}`;

// 3. Call your Model
const reply = await myLLM.chat(prompt, userMessage);

// 4. Save for later
await memori.addMemory(`User: ${userMessage}\nAI: ${reply}`);
```

---

## 3. Custom Embedding Providers

You are not locked into Google. You can use **any** embedding model by implementing the `EmbeddingProvider` interface.

### Step 1: Implement the Interface

```typescript
import { EmbeddingProvider } from "memori-js";

class MyCustomBrain implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // Call API (HuggingFace, Cohere, Local Python Server...)
    const vector = await callMyModel(text);
    return vector; // e.g. [0.1, 0.2, ...]
  }
}
```

### Step 2: Pass to Memori

```typescript
const memori = new Memori({
  embedding: new MyCustomBrain(),
  embeddingDimension: 384, // Match your model's output size!
});
```

---

## 4. Master Configuration Example

Here is how to customize **everything** at once.

```typescript
import { Memori, PostgresVecStore } from "memori-js";

const memori = new Memori({
  // A. Use OpenAI for Embeddings
  apiKey: process.env.OPENAI_API_KEY,
  embedding: new OpenAIEmbedding({ apiKey: process.env.OPENAI_API_KEY }),
  embeddingDimension: 1536,

  // B. Use Postgres for Storage (Production Ready)
  vectorStore: new PostgresVecStore(
    "postgres://user:pass@localhost:5432/vectors"
  ),

  // C. Custom Logging
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERR] ${msg}`),
    debug: () => {},
  },
});
```
