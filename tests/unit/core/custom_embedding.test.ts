import { describe, it, expect, mock } from "bun:test";
import { Memori } from "../../../src/core/memory";
import { EmbeddingProvider } from "../../../src/core/types";

describe("Custom Embedding Provider", () => {
  it("should use the provided custom embedding provider", async () => {
    const mockEmbed = mock((text: string) => Promise.resolve([0.1, 0.2, 0.3]));

    const mockProvider: EmbeddingProvider = {
      embed: mockEmbed,
    };

    const memori = new Memori({
      embedding: mockProvider,
      dbPath: ":memory:",
      embeddingDimension: 3,
    });

    await memori.addMemory("test content");

    expect(mockEmbed).toHaveBeenCalled();
    expect(mockEmbed).toHaveBeenCalledWith("test content");
  });

  it("should fail if no provider and no api key", () => {
    const originalKey = process.env.MEMORI_API_KEY;
    delete process.env.MEMORI_API_KEY;

    expect(() => new Memori({ dbPath: ":memory:" })).toThrow(
      "Missing configuration"
    );

    process.env.MEMORI_API_KEY = originalKey;
  });
});
