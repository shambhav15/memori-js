# 🧠 memori-js

**The SQL-Native AI Memory Fabric for JavaScript & TypeScript.**

`memori-js` is not just a vector database wrapper. It is an **active memory layer** that lives inside your application, automatically managing context for your AI agents. It bridges the gap between your LLM and long-term storage without the complexity of building manual RAG (Retrieval-Augmented Generation) pipelines.

> **Inspired by the [memorilabs.ai](https://memorilabs.ai) Python library.**

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

| Feature          | Standard Vector DB                                  | 🧠 Memori-JS                                                                   |
| :--------------- | :-------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Setup**        | Requires Docker, API keys, or cloud infrastructure. | **Zero-Config**. Creates a local `memori.db` SQLite file instantly.            |
| **Integration**  | You write the RAG pipeline logic manually.          | **Auto-Augmentation**. Patches the LLM client to inject memory automatically.  |
| **Architecture** | External service (Network latency).                 | **Embedded**. Runs in-process via `sqlite-vec` (high-performance C extension). |
| **Data Privacy** | Data leaves your server.                            | **100% Local**. Your data never leaves your infrastructure.                    |
| **Complexity**   | High (Embeddings, Chunking, Retrieval).             | **Low**. Handles embedding generation and retrieval internally.                |

---

## ✨ Features

- **🔌 Provider Agnostic**: Works seamlessly with **OpenAI**, **Google GenAI**, and **Anthropic**.
- **⚡ SQL-Native Performance**: Powered by `sqlite-vec`, the state-of-the-art vector search extension for SQLite. Fast, reliable, and ACID-compliant.
- **🤖 Zero-Shot RAG**: Your older conversations automatically become context for new ones. No training required.
- **📊 Execution Stats**: Built-in metrics to measure context retrieval time and token usage optimization.

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

```typescript
import { Memori } from "memori-js";

// Uses ./memori.db by default
const memori = new Memori({
  googleApiKey: process.env.GOOGLE_API_KEY, // Required for embedding generation
});
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

const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent(
  "What is the secret code I told you?"
);
```

#### Anthropic (Claude)

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

memori.llm.register(client, "anthropic");

const msg = await client.messages.create({
  model: "claude-3-opus",
  messages: [{ role: "user", content: "Recall our last meeting notes." }],
});
```

### 3. Analyze Performance

Check how `memori` is optimizing your interactions:

```typescript
console.log(memori.stats.lastRun);
/*
{
  contextChunks: 5,        // Found 5 relevant past memories
  processingTimeMs: 42,    // Retrieval took only 42ms
  timestamp: "2024-12-11T..."
}
*/
```

---

## 💡 Philosophy

Most "Memory" libraries are just complex wrappers around vector stores. `memori-js` takes a different approach: **Memory should be invisible.**

As a developer, you shouldn't care _how_ the relevant context is found, only that your agent _has_ it. By pushing this logic down into the infrastructure layer (SQLite) and the client layer (Patching), we allow you to build complex, stateful agents with simple, stateless code.

---

## License

MIT
