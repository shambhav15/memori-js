# CLaRa Integration Release Notes (v0.2.0)

## Overview

**CLaRa (Contextual Latent Retrieval augmented generation)** is a major upgrade to the `memori-js` engine. It introduces a two-step optimization pipeline that solves the "Needle in a Haystack" problem for long-term memory.

### The Problem

Traditional RAG (Retrieval Augmented Generation) stores raw text chunks. This leads to:

1.  **Noise**: "Can we meet at 5?" (Meaningless without context) gets embedded alongside important facts.
2.  **Dilution**: Retrieving full conversational transcripts fills up the LLM context window with "fluff," reducing the AI's ability to focus on key data.
3.  **Ambiguity**: Users ask "What about that project?", which has weak vector similarity to "Project Chimera launch date".

### The CLaRa Solution

1.  **Compression (Write-Time)**:
    - Instead of storing raw chat logs, `memori-js` now uses an LLM to compress inputs into **dense facts**.
    - _Result_: ~40-60% reduction in storage size and noise.
2.  **Reasoning (Read-Time)**:
    - Before searching, the engine "thinks" about the user's query to generate better search terms.
    - _Result_: "What about the project?" -> Search for "Project Chimera status, deadlines, blockers".

---

## Performance Benchmarks

We benchmarked CLaRa using **Llama 3.1 8B** (via Groq) and **Gemma 2** (Local).

| Metric                 | Baseline (Vanilla RAG) | CLaRa (Cloud Groq)        | CLaRa (Local Gemma 2)   |
| :--------------------- | :--------------------- | :------------------------ | :---------------------- |
| **Storage Efficiency** | 100% Size              | **58.5% Size** (-41.5%)   | **68.1% Size** (-31.9%) |
| **Retrieval Quality**  | Low (Full text)        | **High** (Key facts only) | **High**                |
| **Insert Latency**     | ~10ms (SQLite)         | ~300ms (API)              | ~4s (Local CPU)         |
| **Cost**               | Free                   | Free\*                    | Free & Private          |

_> Groq currently offers a generous free tier for Llama 3 models._

### Impact Analysis

- **Vector Density**: By removing conversational filler, vector embeddings are far more precise.
- **Context Window**: You can fit **2x more memories** in the same context window due to compression.
- **Latency Trade-off**: CLaRa introduces latency. It is recommended to run insertion in the background (non-blocking) using `queueMemory`.

---

## Quick Start

To enable CLaRa, simply add the `clara` config object:

```typescript
const memori = new Memori({
  // ... keys ...
  clara: {
    enableCompression: true,
    enableReasoning: true,
    // Optional: Use a dedicated, fast model for compression
    compressor: {
      generate: async (prompt) => {
        /* Call Groq/Ollama */
      },
    },
  },
});
```
