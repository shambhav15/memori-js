# 🧠 memori-js

**The SQL-Native AI Memory Fabric for JavaScript & TypeScript.**

`memori-js` is not just a vector database wrapper. It is an **active memory layer** that lives inside your application, automatically managing context for your AI agents. It bridges the gap between your LLM and long-term storage without the complexity of building manual RAG (Retrieval-Augmented Generation) pipelines.

<div align="center">
  <h3>
    <a href="https://memori-ts.vercel.app/">🌐 Website</a> | 
    <a href="https://memori-ts.vercel.app/docs">📚 Documentation</a>
  </h3>
</div>

---

> **Inspired by the [memorilabs.ai](https://memorilabs.ai) Python library.**

---

## 🆕 Recent Updates (v1.1)

- **Dynamic Embeddings:** You can now bring **any** embedding provider (OpenAI, HuggingFace, etc.) using the `embedding` prop.
- **Provider Agnostic API:** `googleApiKey` is now `apiKey` and `MEMORI_API_KEY`.
- **Master Guide:** See [MASTER_CONFIG.md](./MASTER_CONFIG.md) for advanced customization.
- **Record:** See [WALKTHROUGH_RECORD.md](./WALKTHROUGH_RECORD.md) for a change log.

---

## 🚀 Why Memori?

If you are building an AI app today, you usually have to:

1.  Set up a vector DB (Pinecone, Qdrant, Weaviate, etc.).
2.  Manually chunk and embed user input.
3.  Query the DB.
4.  Inject user context into the system prompt.
5.  Call the LLM.
6.  Save the new conversation back to the DB/Embeddings.

**With `memori-js`, you just do this:**

```typescript
// 1 line to register memory
memori.llm.register(client);

// Call your LLM as normal
await client.chat.completions.create({ ... });
```

### Memori vs. Standard Vector DBs

| Feature         | Standard Vector DB                                  | 🧠 Memori-JS                                                                  |
| :-------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Setup**       | Requires Docker, API keys, or cloud infrastructure. | **Zero-Config**. Creates a local `memori.db` SQLite file instantly.           |
| **Scalability** | Manual migration needed.                            | **Pluggable**. Scale from local SQLite to Postgres/Supabase seamlessly.       |
| **Integration** | You write the RAG pipeline logic manually.          | **Auto-Augmentation**. Patches the LLM client to inject memory automatically. |
| **Complexity**  | High (Embeddings, Chunking, Retrieval).             | **Low**. Handles embedding generation and retrieval internally.               |

---

## ✨ Features

- **🔌 Provider Agnostic**: Works seamlessly with **OpenAI**, **Google GenAI**, and **Anthropic**.
- **☁️ Cloud Ready**: Switch between **Local SQLite** (default) or **Postgres** (Supabase, Neon) with one line of config.
- **🛡️ Enterprise Quality**: Built-in **Arktype** validation, **Structured Logging**, and typed Error Handling.
- **⚡ SQL-Native Performance**: Powered by `sqlite-vec` locally or `pgvector` in the cloud.
- **🤖 Zero-Shot RAG**: Your older conversations automatically become context for new ones.

---

## 📦 Installation

```bash
npm install memori-js
# or
bun add memori-js
```

---

## 🛠️ Usage

### 1. Initialize

#### Option A: Zero Config (Local SQLite)

```typescript
import { Memori } from "memori-js";

const memori = new Memori({
  apiKey: process.env.MEMORI_API_KEY, // Default is Google GenAI
});
```

#### Option B: Cloud Scalability (Postgres)

```typescript
import { Memori, PostgresVecStore } from "memori-js";

const memori = new Memori({
  apiKey: process.env.MEMORI_API_KEY,
  // Seamlessly switch to Postgres for production
  vectorStore: new PostgresVecStore(process.env.DATABASE_URL!),
});
await memori.config.storage.build(); // Initializes tables if missing
```

### 2. Connect Your LLM

Memori supports "Patching" — it wraps your existing LLM client to add memory capabilities transparently.

#### OpenAI

```typescript
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

memori.llm.register(client, "openai");

// Now, every call is memory-augmented!
const response = await client.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "What is my favorite color?" }],
});
```

#### Google GenAI (Gemini)

```typescript
import { GoogleGenAI } from "@google/genai";
const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

memori.llm.register(client, "google");
```

#### Anthropic (Claude)

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

memori.llm.register(client, "anthropic");
```

### 3. Advanced Configuration

memori-js uses **Arktype** for ultra-fast runtime validation and strict typing.

```typescript
import { ConsoleLogger } from "memori-js";

const memori = new Memori({
  apiKey: "...",
  dbPath: "./custom-memory.db",
  logger: new ConsoleLogger(), // Or pass your own Pino/Winston wrapper
});
```

### 📖 Master Configuration Guide

For deep customization (Custom Embeddings, Vectors, etc.), check out the **[Master Configuration Guide](./MASTER_CONFIG.md)**.
It covers:

- Using Custom Embedding Providers (OpenAI, Voyage, Local)
- End-to-End Workflow Diagram
- Full Configuration Options Reference
  \*/

````

### 4. Advanced Augmentation (Multi-Tenancy)

For multi-user apps (chatbots, agents), you can isolate memory by User ID and Agent ID.

```typescript
// Define context for the current operation
memori.attribution("user-123", "agent-sales");

// All subsequent operations are scoped to this user
await memori.addMemory("I like apples."); // Stored with metadata

// Search is filtered automatically
const results = await memori.search("What do I like?");
// returns "I like apples." ONLY for user-123
````

---

## 💡 Philosophy

Most "Memory" libraries are just complex wrappers around vector stores. `memori-js` takes a different approach: **Memory should be invisible.**

As a developer, you shouldn't care _how_ the relevant context is found, only that your agent _has_ it. By pushing this logic down into the infrastructure layer (SQLite/Postgres) and the client layer (Patching), we allow you to build complex, stateful agents with simple, stateless code.

---

## License

MIT
