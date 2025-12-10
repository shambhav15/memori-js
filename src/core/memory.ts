import { MemoriDB } from "./db";
import { GoogleGenAI } from "@google/genai";

export interface MemoriOptions {
  dbPath?: string;
  googleApiKey?: string;
}

export class Memori {
  private db: MemoriDB;
  private client: GoogleGenAI;

  constructor(options: MemoriOptions = {}) {
    this.db = new MemoriDB(options.dbPath);

    const apiKey = options.googleApiKey || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is required for embeddings.");
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async addMemory(content: string, role = "user") {
    // 1. Get Embedding
    const embedding = await this.getEmbedding(content);

    // 2. Store
    return await this.db.insert(content, embedding, role);
  }

  async search(query: string, limit = 5) {
    const embedding = await this.getEmbedding(query);
    return await this.db.search(embedding, limit);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: "text-embedding-004",
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
