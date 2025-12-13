import { pipeline } from "@xenova/transformers";
import { EmbeddingProvider } from "../core/types";
import { ConsoleLogger } from "../core/logger";

export class TransformerEmbedding implements EmbeddingProvider {
  private pipe: any;
  private modelName: string;
  private logger = new ConsoleLogger();

  constructor(modelName: string = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }

  private async init() {
    if (this.pipe) return;

    this.logger.info(`Loading local embedding model: ${this.modelName}...`);
    // 'feature-extraction' is the task for embeddings
    this.pipe = await pipeline("feature-extraction", this.modelName);
    this.logger.info("Local model loaded successfully.");
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipe) await this.init();

    try {
      // pooling: 'mean' and normalize: true are standard for sentence embeddings
      const result = await this.pipe(text, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(result.data);
    } catch (error) {
      this.logger.error("Failed to generate local embedding:", error);
      throw error;
    }
  }
}
