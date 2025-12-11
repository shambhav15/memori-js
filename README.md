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

## Configuration

Ensure you have your API keys set in your environment variables:

```bash
export GOOGLE_API_KEY="your_google_key" # Required for embeddings
export OPENAI_API_KEY="your_openai_key" # Required if using OpenAI for chat
```

## License

MIT
