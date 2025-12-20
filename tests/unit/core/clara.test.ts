import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Memori } from "../../../src/core/memory";
import { EmbeddingProvider } from "../../../src/core/types";

// Mock Embedding Provider
class MockEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    return new Array(768).fill(0.1);
  }
}

describe("CLaRa Integration", () => {
  let memori: Memori;
  let mockGenerator: any;

  beforeEach(async () => {
    mockGenerator = mock((prompt: string) =>
      Promise.resolve("MOCKED_RESPONSE")
    );

    memori = new Memori({
      dbPath: ":memory:",
      embedding: new MockEmbedding(),
      clara: {
        enableCompression: true,
        enableReasoning: true,
      },
      llm: {
        generate: mockGenerator,
      },
    });

    await memori.config.storage.build();
  });

  it("should compress memory before insertion when enabled", async () => {
    // Setup mock to return specific compressed content
    mockGenerator.mockImplementation(async (prompt: string) => {
      if (prompt.includes("Compress")) return "COMPRESSED_CONTENT";
      return "OTHER";
    });

    await memori.addMemory("Original Long Content");

    // Search to verify what was stored
    // We search for "COMPRESSED_CONTENT" and expect it to be found
    const results = await memori.search("query", 1);

    expect(results.length).toBeGreaterThan(0);
    const savedMemory = results[0];

    // The content stored in vector DB should be the compressed version
    expect(savedMemory.content).toBe("COMPRESSED_CONTENT");

    // The original content should be in metadata
    expect(savedMemory.metadata?.original_content).toBe(
      "Original Long Content"
    );
    expect(savedMemory.metadata?.is_compressed).toBe(true);
  });

  it("should use original content if compression fails", async () => {
    // Setup mock to throw error
    mockGenerator.mockImplementation(async () => {
      throw new Error("Generator Failed");
    });

    await memori.addMemory("Original Content");

    const results = await memori.search("query", 1);
    expect(results[0].content).toBe("Original Content");
    expect(results[0].metadata?.is_compressed).toBeUndefined();
  });

  it("should reason about query before search when enabled", async () => {
    mockGenerator.mockImplementation(async (prompt: string) => {
      if (prompt.includes("user is asking")) return "REASONED_QUERY";
      return "NORMAL";
    });

    // We need to spy on the internal search or inspect the used query stat
    // The implementation updates `stats.lastRun.usedQuery`

    // Seed DB so search doesn't fail
    await memori.addMemory("Something");

    // We need access to retrieveContext which is private, BUT
    // we can use the `llm.register` patch logic to trigger it, OR
    // just use a public method if exposed.
    // Wait, `retrieveContext` is private.
    // However, `memori` exposes `stats` after runs.
    // AND `retrieveContext` is used by the LLM patchers.
    // A better way for unit test is to trust `addMemory` worked, and check if we can verify `enhanceQuery`.

    // Actually, `retrieveContext` is NOT public.
    // But `Memori` has `retrieveContext` used in `google` patch for example.
    // I can simulate a "Google" call if I had a mock client, but that's complex.

    // Instead, I'll temporarily bypass TS privacy for testing or use `process` related properties?
    // No, I'll use `(memori as any).retrieveContext("User Query")`

    await (memori as any).retrieveContext("User Query");

    // Check if generator was called with reasoning prompt
    expect(mockGenerator).toHaveBeenCalled();
    const lastCall = mockGenerator.mock.lastCall;
    expect(lastCall[0]).toContain("user is asking");

    // Check stats to see if "REASONED_QUERY" was used
    expect(memori.stats.lastRun?.usedQuery).toBe("REASONED_QUERY");
  });
});
