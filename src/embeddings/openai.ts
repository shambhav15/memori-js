import OpenAI from "openai";
import { EmbeddingProvider } from "../core/types";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseURL?: string; // Support for OpenAI-compatible endpoints
}

export class OpenAIEmbedding implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAIEmbeddingOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    // Default to the cheaper, newer model
    this.model = options.model || "text-embedding-3-small";
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      encoding_format: "float",
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error("Failed to get embedding from OpenAI");
    }

    return response.data[0].embedding;
  }
}
