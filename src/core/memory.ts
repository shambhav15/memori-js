import { type } from "arktype";
import { SqliteVecStore } from "../stores/sqlite";
import { VectorStore, EmbeddingProvider } from "./types";
import { GoogleGenAIEmbedding } from "../embeddings/google";
import OpenAI from "openai";
import { Logger, ConsoleLogger } from "./logger";
import { ConfigurationError, EmbeddingError, VectorStoreError } from "./errors";

// ArkType Validation Definition
// Defines the schema for configuration options
const MemoriConfig = type({
  "dbPath?": "string",
  "apiKey?": "string",
  "vectorStore?": "unknown",
  "embedding?": "unknown",
  "embeddingDimension?": "number",
  "logger?": "unknown",
});

export type MemoriOptions = typeof MemoriConfig.infer;

export type LLMProvider = "openai" | "google" | "anthropic";

/**
 * Statistics for the last execution of context retrieval.
 */
export interface ExecutionStats {
  lastRun?: {
    /** Number of memory chunks retrieved and injected */
    contextChunks: number;
    /** Time taken to search and retrieve context in milliseconds */
    processingTimeMs: number;
    /** Timestamp of the operation */
    timestamp: string;
  };
}

/**
 * The main class for the Memori library.
 * It manages the connection to the vector store, handles embedding generation,
 * and patches LLM clients to automatically inject long-term memory context.
 */
export class Memori {
  private db: VectorStore;
  private embeddingProvider: EmbeddingProvider;
  private logger: Logger;
  private entityId: string | null = null;
  private processId: string | null = null;
  private pendingPromises: Promise<any>[] = [];

  /**
   * Public statistics object to track performance and usage.
   */
  public stats: {
    lastRun?: {
      contextChunks: number;
      processingTimeMs: number;
      timestamp: string;
    };
  } = {};

  /**
   * Configuration helper.
   * Currently exposes storage build method.
   */
  public config: {
    storage: {
      /**
       * Manuall initialize the storage backend.
       * Useful if you want to ensure the DB is ready before starting the app.
       */
      build: () => Promise<void>;
    };
  };

  /**
   * Interface to register and patch LLM clients.
   */
  public llm: {
    /**
     * Patches an LLM client instance (OpenAI, Anthropic, etc.) to automatically use Memori.
     * @param client - The LLM client instance.
     * @param provider - The provider name ("openai", "google", "anthropic").
     * @returns The Memori instance for chaining.
     */
    register: (
      client: any,
      provider?: "openai" | "google" | "anthropic"
    ) => Memori;
  };

  /**
   * Augmentation controls.
   */
  public augmentation: {
    /**
     * Waits for all background memory storage operations to complete.
     * Use this before shutting down or when strict consistency is needed.
     */
    wait: () => Promise<void>;
  };

  /**
   * Creates a new Memori instance.
   * @param options - Configuration options.
   */
  constructor(options: MemoriOptions = {}) {
    // Validate Options using ArkType
    const result = MemoriConfig(options);
    if (result instanceof type.errors) {
      throw new ConfigurationError(
        `Invalid Memori configuration: ${result.summary}`
      );
    }

    const config = result;

    // Logger Init
    this.logger = (config.logger as Logger) || new ConsoleLogger();

    // Dependency Injection / Factory Pattern
    // Allows injecting a custom vector store implementation (e.g., Postgres, Redis)
    if (config.vectorStore) {
      this.db = config.vectorStore as VectorStore;
    } else {
      // Default Backward Compatibility: Use local SQLite
      // Default dimension 768 to match Google GenAI default
      const dim = config.embeddingDimension || 768;
      this.db = new SqliteVecStore(config.dbPath, this.logger, dim);
      this.db
        .init()
        .catch((e) => this.logger.error("Failed to init default DB:", e));
    }

    const apiKey = config.apiKey || process.env.MEMORI_API_KEY;

    if (config.embedding) {
      this.embeddingProvider = config.embedding as EmbeddingProvider;
    } else if (apiKey) {
      this.embeddingProvider = new GoogleGenAIEmbedding({ apiKey });
    } else {
      throw new ConfigurationError(
        "Missing configuration: Provide either an 'embedding' provider or 'apiKey' (or set MEMORI_API_KEY env var) for default Google embeddings."
      );
    }

    this.config = {
      storage: {
        build: async () => {
          await this.db.init();
        },
      },
    };

    this.llm = {
      register: (client: any, provider: LLMProvider = "openai") => {
        // Dispatch based on provider to specific patch logic
        if (provider === "openai") this.patchOpenAI(client);
        else if (provider === "anthropic") this.patchAnthropic(client);
        else if (provider === "google") this.patchGoogle(client);
        else
          throw new ConfigurationError(
            `Provider ${provider} not supported yet.`
          );

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

  /**
   * Set context attribution.
   * This scopes future searches and inserts to specific entities or processes.
   * @param entity_id - The ID of the user or agent.
   * @param process_id - The ID of the conversation or process.
   */
  public attribution(entity_id: string, process_id: string) {
    this.entityId = entity_id;
    this.processId = process_id;
  }

  /**
   * Internal helper to retrieve relevant context for a query.
   * 1. Embeds the query.
   * 2. Searches the vector store.
   * 3. Formats the results into a context string.
   */
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
      this.logger.error("Memori search failed:", e);
      // Fail gracefully for context retrieval so the chat doesn't crash
    }

    this.stats.lastRun = {
      contextChunks: chunks,
      processingTimeMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };

    return context;
  }

  /**
   * Monkey-patches the OpenAI client to intercept chat completions.
   * It injects memory context into the system prompt and auto-saves the conversation.
   */
  private patchOpenAI(client: OpenAI) {
    const originalCreate = client.chat.completions.create.bind(
      client.chat.completions
    );
    // @ts-ignore
    client.chat.completions.create = async (body: any, options?: any) => {
      const messages = body.messages || [];
      // Find the last user message to use as the search query
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
        // Inject context as a system message at the beginning
        newMessages.unshift({
          role: "system",
          content: `Use the following memory context to answer the user if relevant:\n${context}`,
        });
      }

      // Call the original SDK method with modified messages
      const response = await originalCreate(
        { ...body, messages: newMessages },
        options
      );

      // Auto-save the interaction to memory in the background
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

  /**
   * Monkey-patches the Anthropic client.
   * Handle specific message format and system prompt behavior of Claude.
   */
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
      };

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

  /**
   * Monkey-patches the Google GenAI client.
   * Wraps the model.generateContent method.
   */
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

  /**
   * Helper to queue memory insertions in the background without blocking the main flow.
   */
  private queueMemory(content: string, role: string) {
    const p = this.addMemory(content, role).catch((e) =>
      console.error("Memori save failed:", e)
    );
    this.pendingPromises.push(p);
  }

  /**
   * Adds a new memory to the vector store.
   * Generates embedding and persists it.
   */
  async addMemory(content: string, role = "user") {
    const embedding = await this.getEmbedding(content);
    return await this.db.insert(content, embedding, {
      role,
      entityId: this.entityId || undefined,
      processId: this.processId || undefined,
      // sessionId: this.sessionId // TODO: Add session management
    });
  }

  /**
   * Searches for memories similar to a given query string.
   */
  async search(query: string, limit = 5) {
    const embedding = await this.getEmbedding(query);
    const filter = {
      entityId: this.entityId || undefined,
      processId: this.processId || undefined,
    };
    return await this.db.search(embedding, limit, filter);
  }

  /**
   * Generates a vector embedding for the given text using Google's GenAI model.
   */
  private async getEmbedding(text: string): Promise<number[]> {
    return await this.embeddingProvider.embed(text);
  }
}
