import { MemoriDB } from "./db";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface MemoriOptions {
  dbPath?: string;
  googleApiKey?: string;
}

export type LLMProvider = "openai" | "google" | "anthropic";

export interface ExecutionStats {
  lastRun?: {
    contextChunks: number;
    processingTimeMs: number;
    timestamp: string;
  };
}

export class Memori {
  private db: MemoriDB;
  private client: GoogleGenAI;
  private entityId: string | null = null;
  private processId: string | null = null;
  private pendingPromises: Promise<any>[] = [];

  public stats: ExecutionStats = {};

  public config: {
    storage: {
      build: () => Promise<void>;
    };
  };

  public llm: {
    register: (client: any, provider?: LLMProvider) => Memori;
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

    this.config = {
      storage: {
        build: async () => Promise.resolve(),
      },
    };

    this.llm = {
      register: (client: any, provider: LLMProvider = "openai") => {
        if (provider === "openai") this.patchOpenAI(client);
        else if (provider === "anthropic") this.patchAnthropic(client);
        else if (provider === "google") this.patchGoogle(client);
        else throw new Error(`Provider ${provider} not supported yet.`);

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

  private async retrieveContext(query: string): Promise<string> {
    const start = Date.now();
    let context = "";
    let chunks = 0;

    try {
      const results = await this.search(query, 5);
      chunks = results.length;
      if (chunks > 0) {
        context = results
          .map((r) => `- ${r.content} (score: ${r.distance})`)
          .join("\n");
      }
    } catch (e) {
      console.error("Memori search failed:", e);
    }

    this.stats.lastRun = {
      contextChunks: chunks,
      processingTimeMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };

    return context;
  }

  private patchOpenAI(client: OpenAI) {
    const originalCreate = client.chat.completions.create.bind(
      client.chat.completions
    );
    // @ts-ignore
    client.chat.completions.create = async (body: any, options?: any) => {
      const messages = body.messages || [];
      const lastMsg = messages
        .slice()
        .reverse()
        .find((m: any) => m.role === "user");

      let context = "";
      if (lastMsg && typeof lastMsg.content === "string") {
        context = await this.retrieveContext(lastMsg.content);
      }

      const newMessages = [...messages];
      if (context) {
        newMessages.unshift({
          role: "system",
          content: `Use the following memory context to answer the user if relevant:\n${context}`,
        });
      }

      const response = await originalCreate(
        { ...body, messages: newMessages },
        options
      );

      // Auto-save
      if (lastMsg && typeof lastMsg.content === "string") {
        this.queueMemory(lastMsg.content, "user");
        if ("choices" in response) {
          const aiContent = response.choices[0].message.content;
          if (aiContent) this.queueMemory(aiContent, "assistant");
        }
      }
      return response;
    };
  }

  private patchAnthropic(client: any) {
    // Anthropic SDK: client.messages.create({...})
    const originalCreate = client.messages.create.bind(client.messages);
    client.messages.create = async (body: any, options?: any) => {
      const messages = body.messages || [];
      const lastMsg = messages[messages.length - 1];

      let context = "";
      if (
        lastMsg &&
        lastMsg.role === "user" &&
        typeof lastMsg.content === "string"
      ) {
        context = await this.retrieveContext(lastMsg.content);
      }

      // Anthropic System Prompt handling
      let newSystem = body.system || "";
      if (context) {
        // If system is array of blocks (beta), handle strings only for now or append to string
        if (typeof newSystem === "string") {
          newSystem = `${newSystem}\n\n[Memory Context]:\n${context}`;
        }
        // If it is undefined or null, just set it
        if (!newSystem) newSystem = `[Memory Context]:\n${context}`;
      }

      const newBody = { ...body, system: newSystem };

      const start = Date.now();
      const response = await originalCreate(newBody, options);
      this.stats.lastRun = {
        ...this.stats.lastRun!,
        processingTimeMs: Date.now() - start,
      }; // Update time with LLM time too? No, keep context retrieval time separate or cumulative? User asked for comparison. Let's keep separate retrieval time vs total time in future.

      // Auto-save
      if (lastMsg && typeof lastMsg.content === "string") {
        this.queueMemory(lastMsg.content, "user");
        // Anthropic response structure
        if (
          response.content &&
          Array.isArray(response.content) &&
          response.content.length > 0
        ) {
          const textBlock = response.content.find(
            (b: any) => b.type === "text"
          );
          if (textBlock && textBlock.text) {
            this.queueMemory(textBlock.text, "assistant");
          }
        }
      }
      return response;
    };
  }

  private patchGoogle(client: any) {
    // Google GenAI SDK: client.getGenerativeModel({ model: "..." }) returns a model instance.
    // We must patch getGenerativeModel to return a wrapped model.

    const originalGetModel = client.getGenerativeModel.bind(client);

    client.getGenerativeModel = (modelParams: any, requestOptions: any) => {
      const model = originalGetModel(modelParams, requestOptions);

      // Patch the generateContent method of the returned model
      const originalGenerate = model.generateContent.bind(model);

      model.generateContent = async (...args: any[]) => {
        // args[0] can be string or object or array
        let contentArg = args[0];
        let lastText = "";

        // Normalization of Google GenAI input
        if (typeof contentArg === "string") {
          lastText = contentArg;
        } else if (Array.isArray(contentArg)) {
          // Array of Content or Strings
          lastText = JSON.stringify(contentArg); // fallback
        } else if (typeof contentArg === "object") {
          // Maybe Content object { role, parts }
          if (contentArg.parts) {
            // parts can be string or array
            // simplify extraction
            lastText = JSON.stringify(contentArg);
          }
        }

        // Retrieve context
        let context = "";
        if (lastText) {
          // Try to extract actual user prompt for search
          // For simplicity, we search the whole raw string or basic text
          context = await this.retrieveContext(lastText.substring(0, 500));
        }

        // Inject Context
        // Google GenAI supports "systemInstruction" at model config level usually,
        // but here we are at generateContent time.
        // Best is to prepend to prompt.
        if (context) {
          if (typeof contentArg === "string") {
            args[0] = `[Memory Context]:\n${context}\n\n${contentArg}`;
          } else if (
            typeof contentArg === "object" &&
            !Array.isArray(contentArg)
          ) {
            // Ideally we modify parts
            // This is complex for Google's flexible API.
            // Implementation simplified for "String" prompts or basic object usage.
          }
        }

        const response = await originalGenerate(...args);

        // Response is usually { response: { candidates: [...] } } or similar
        // Wait for the result object
        const result = await response.response;
        const text = result.text(); // Helper method in Google SDK

        if (lastText && text) {
          this.queueMemory(lastText, "user");
          this.queueMemory(text, "assistant");
        }

        return response;
      };

      return model;
    };
  }

  private queueMemory(content: string, role: string) {
    const p = this.addMemory(content, role).catch((e) =>
      console.error("Memori save failed:", e)
    );
    this.pendingPromises.push(p);
  }

  async addMemory(content: string, role = "user") {
    const embedding = await this.getEmbedding(content);
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
