# memori-js

**Memori-JS** is a SQL-native AI memory fabric for JavaScript and TypeScript. It allows your AI agents to "remember" conversations and facts using high-performance local vector search (via `sqlite-vec`).

Inspired by the Python `memori` library.

## Features

- **SQL-Native**: Uses SQLite + `sqlite-vec` for fast, local vector storage. No external vector DB required.
- **Auto-Augmentation**: Intercepts OpenAI/LLM calls to automatically save and recall context.
- **Provider Agnostic**: Currently configured for **Google GenAI Embeddings** (`text-embedding-004`) for low cost and high performance.
- **TypeScript First**: Full type safety.

## Installation

```bash
npm install memori-js
# or
bun add memori-js
```

## Basic Usage

```typescript
import { Memori } from "memori-js";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Memori with the client
const memori = new Memori().llm.register(client);

// Run your chat as normal - Memori injects context automatically!
const response = await client.chat.completions.create({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "My favorite color is blue." }],
});
```

## Database Connection

By default, `memori-js` creates a local SQLite database named `memori.db` in your current working directory.

To use a custom path or an existing database:

```typescript
// Connects to ./custom/path/memory.db
const memori = new Memori({
  dbPath: "./custom/path/memory.db",
});
```

## Supported Providers

`memori-js` can patch clients from OpenAI, Google, and Anthropic to automatically inject memory.

### OpenAI

```typescript
import OpenAI from "openai";
// ...
memori.llm.register(openaiClient, "openai");
```

### Google GenAI

```typescript
import { GoogleGenAI } from "@google/genai";
const client = new GoogleGenAI({ apiKey: "..." });

// Register the client BEFORE creating models
memori.llm.register(client, "google");

// Now use the client as normal
const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent("Hello!");
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: "..." });

memori.llm.register(client, "anthropic");
```

## Execution Stats

You can inspect `memori.stats` to see metrics about the last run, useful for comparing "Zero-Shot" vs "Memory-Augmented" performance.

```typescript
console.log(memori.stats.lastRun);
// {
//   contextChunks: 3,        // Number of memory chunks injected
//   processingTimeMs: 120,   // Time taken to retrieve context
//   timestamp: "..."
// }
```

## Database Connection

MIT
