import { GoogleGenAI } from "@google/genai";
import { EmbeddingProvider } from "../core/types";

export interface GoogleGenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
}

export class GoogleGenAIEmbedding implements EmbeddingProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(options: GoogleGenAIEmbeddingOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model || "text-embedding-004";
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
    });

    if (
      !response.embeddings ||
      !response.embeddings[0] ||
      !response.embeddings[0].values
    ) {
      throw new Error("Failed to get embedding from Google GenAI");
    }

    return response.embeddings[0].values;
  }
}
