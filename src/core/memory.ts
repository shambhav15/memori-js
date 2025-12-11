import { MemoriDB } from "./db";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface MemoriOptions {
  dbPath?: string;
  googleApiKey?: string;
}

export class Memori {
  private db: MemoriDB;
  private client: GoogleGenAI;
  private entityId: string | null = null;
  private processId: string | null = null;
  private pendingPromises: Promise<any>[] = [];

  public config: {
    storage: {
      build: () => Promise<void>;
    };
  };

  public llm: {
    register: (client: OpenAI) => Memori;
  };

  public augmentation: {
    wait: () => Promise<void>;
  };

  constructor(options: MemoriOptions = {}) {
    this.db = new MemoriDB(options.dbPath);

    const apiKey = options.googleApiKey || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is required for embeddings.");
    }

    this.client = new GoogleGenAI({ apiKey });

    // Match Python API structure
    this.config = {
      storage: {
        build: async () => {
          return Promise.resolve();
        },
      },
    };

    this.llm = {
      register: (openaiClient: OpenAI) => {
        this.patchOpenAIClient(openaiClient);
        return this;
      },
    };

    this.augmentation = {
      wait: async () => {
        await Promise.all(this.pendingPromises);
        this.pendingPromises = [];
      },
    };
  }

  public attribution(entity_id: string, process_id: string) {
    this.entityId = entity_id;
    this.processId = process_id;
  }

  /**
   * Patches the OpenAI client to intercept chat completions
   */
  private patchOpenAIClient(client: OpenAI) {
    const originalCreate = client.chat.completions.create.bind(
      client.chat.completions
    );

    // @ts-ignore
    client.chat.completions.create = async (body: any, options?: any) => {
      // 1. EXTRACT QUERY
      const messages = body.messages || [];
      const lastMsg = messages
        .slice()
        .reverse()
        .find((m: any) => m.role === "user");
      let context = "";

      if (lastMsg && typeof lastMsg.content === "string") {
        try {
          const results = await this.search(lastMsg.content, 5);
          if (results.length > 0) {
            context = results
              .map((r) => `- ${r.content} (score: ${r.distance})`)
              .join("\n");
          }
        } catch (e) {
          console.error("Memori search failed:", e);
        }
      }

      // 2. INJECT CONTEXT
      const newMessages = [...messages];
      if (context) {
        newMessages.unshift({
          role: "system",
          content: `Use the following memory context to answer the user if relevant:\n${context}`,
        });
      }

      // 3. EXECUTE ORIGINAL
      const response = await originalCreate(
        { ...body, messages: newMessages },
        options
      );

      // 4. AUTO-SAVE (Background)
      if (lastMsg && typeof lastMsg.content === "string") {
        const p1 = this.addMemory(lastMsg.content, "user").catch((e) =>
          console.error("Failed to save user memory", e)
        );
        this.pendingPromises.push(p1);

        if ("choices" in response) {
          const aiContent = response.choices[0].message.content;
          if (aiContent) {
            const p2 = this.addMemory(aiContent, "assistant").catch((e) =>
              console.error("Failed to save AI memory", e)
            );
            this.pendingPromises.push(p2);
          }
        }
      }

      return response;
    };
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
