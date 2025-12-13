import { Memori } from "../src/index"; // Using local source
import { pipeline } from "@xenova/transformers";

// A custom "Local" embedding provider
class LocalEmbeddingProvider {
  private pipe: any;
  private modelName: string;

  // "Xenova/all-MiniLM-L6-v2"  (384 dimensions, ~23MB) - Fast, default
  // "Xenova/all-mpnet-base-v2" (768 dimensions, ~420MB) - High quality, matches Memori Python
  constructor(modelName: string = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }

  async init() {
    // This downloads the model (~23MB quantized) to the local cache once
    console.log(`Loading local model: ${this.modelName}...`);
    this.pipe = await pipeline("feature-extraction", this.modelName);
    console.log("Model loaded!");
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipe) await this.init();

    // Generate embedding
    const result = await this.pipe(text, { pooling: "mean", normalize: true });
    // result.data is a Float32Array
    return Array.from(result.data);
  }
}

async function main() {
  console.log("--- Free Forever Local Embeddings Demo ---");

  // 1. Setup Local Provider
  const localEmbedder = new LocalEmbeddingProvider();
  await localEmbedder.init();

  // 2. Initialize Memori with Custom Embedding
  // We don't need an API key for Memori if we provide our own embedding!
  const memori = new Memori({
    embedding: localEmbedder,
    embeddingDimension: 384, // all-MiniLM-L6-v2 is 384d (Google is 768d)
    dbPath: "local-brain.db", // Separate DB for different dimensions
  });
  await memori.config.storage.build();

  // 3. Teach
  console.log("Teaching...");
  await memori.addMemory(
    "I love coding with local models because they are free."
  );

  // 4. Verify (Search)
  console.log("Searching...");
  const results = await memori.search("Why do I like local models?");

  console.log("\nFound Memories:");
  results.forEach((r) =>
    console.log(`- ${r.content} (Distance: ${r.distance.toFixed(4)})`)
  );
}

// NOTE: You need to install the dependency first:
// bun add @xenova/transformers
main().catch(console.error);
