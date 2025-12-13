import { type } from "arktype";
import { SqliteVecStore } from "../stores/sqlite";
import { VectorStore, EmbeddingProvider } from "./types";
import { GoogleGenAIEmbedding } from "../embeddings/google";
import { TransformerEmbedding } from "../embeddings/transformer";
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

    const apiKey = config.apiKey || process.env.MEMORI_API_KEY;
    let defaultDimensions = 768; // Default for Google

    if (config.embedding) {
      // 1. User provided explicit embedding provider
      this.embeddingProvider = config.embedding as EmbeddingProvider;
    } else if (apiKey) {
      // 2. Auto-Detect based on API Key Prefix
      if (apiKey.startsWith("AIza")) {
        // Google Key
        this.embeddingProvider = new GoogleGenAIEmbedding({ apiKey });
        defaultDimensions = 768;
      } else if (apiKey.startsWith("sk-")) {
        // OpenAI Key (User must likely install 'openai' if they haven't, but we can't assume imports here dynamically easily without lazy loading)
        // For now, we will throw if they try to use OpenAI key without passing the provider explicitly, OR we can try to lazy load.
        // To keep it simple and robust as per plan: explicit support for Google (built-in) or error.
        // Wait, 'openai' is in dependencies. We can import it?
        // Actually, let's keep it simple: If they provide sk- key, we accept it IF we implemented OpenAIEmbedding.
        // DO WE HAVE OpenAIEmbedding? I need to check.
        // Checking file... NO. We only have GoogleGenAIEmbedding in codebase so far (visible).
        // Re-reading 'src/index.ts' might reveal it, but safely:

        throw new ConfigurationError(
          "OpenAI API Key detected ('sk-...') but OpenAIEmbedding is not automatically configured yet. Please pass the 'embedding' option explicitly with an OpenAI provider."
        );
      } else {
        // Unknown Key
        throw new ConfigurationError(
          "Unknown API Key format. If using a custom provider, please pass the 'embedding' option explicitly."
        );
      }
    } else {
      // 3. Fallback: Free Local Model
      this.logger.info(
        "No API Key found. Using free local embeddings (Xenova/all-MiniLM-L6-v2)."
      );
      this.embeddingProvider = new TransformerEmbedding();
      defaultDimensions = 384;
    }

    // Default Vector Store
    if (config.vectorStore) {
      this.db = config.vectorStore as VectorStore;
    } else {
      const dim = config.embeddingDimension || defaultDimensions;
      this.db = new SqliteVecStore(config.dbPath, this.logger, dim);
      this.db
        .init()
        .catch((e) => this.logger.error("Failed to init default DB:", e));
    }

    this.config = {
      storage: {
        build: async () => {
          await this.db.init();
        },
      },
    };

    this.llm = {
      register: (
        client: any,
        providerName?: "openai" | "google" | "anthropic"
      ) => {
        // Auto-detect provider if not specified
        if (!providerName) {
          if (
            client.models &&
            typeof client.models.generateContent === "function"
          ) {
            providerName = "google";
            this.logger.info("Auto-detected LLM Provider: Google");
          } else if (client.chat && client.chat.completions) {
            providerName = "openai";
            this.logger.info("Auto-detected LLM Provider: OpenAI");
          } else if (
            client.messages &&
            typeof client.messages.create === "function"
          ) {
            providerName = "anthropic";
            this.logger.info("Auto-detected LLM Provider: Anthropic");
          } else {
            throw new Error(
              "Could not auto-detect LLM provider. Please specify 'openai', 'google', or 'anthropic' as the second argument."
            );
          }
        }

        switch (providerName) {
          case "openai":
            this.patchOpenAI(client);
            break;
          case "google":
            this.patchGoogle(client);
            break;
          case "anthropic":
            this.patchAnthropic(client);
            break;
          default:
            throw new ConfigurationError(
              `Provider '${providerName}' not supported or could not be auto-detected. Please specify 'openai', 'google', or 'anthropic'.`
            );
        }
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
  /**
   * Monkey-patches the Google GenAI client (v1/Vertex SDK).
   * Wraps the client.models.generateContent method.
   */
  private patchGoogle(client: any) {
    // The new @google/genai SDK exposes client.models.generateContent(...)
    if (!client.models || !client.models.generateContent) {
      this.logger.error(
        "Invalid Google Client: missing models.generateContent"
      );
      return;
    }

    const originalGenerate = client.models.generateContent.bind(client.models);

    client.models.generateContent = async (args: any) => {
      let config = args;
      let lastText = "";

      // Extract User Query
      // Structure: { contents: [ { role: 'user', parts: [ { text: '...' } ] } ] }
      if (config.contents && Array.isArray(config.contents)) {
        const lastContent = config.contents[config.contents.length - 1];
        if (lastContent && lastContent.parts && lastContent.parts.length > 0) {
          const part = lastContent.parts[0];
          if (part.text) lastText = part.text;
        }
      }

      // 1. Retrieve Context
      let context = "";
      if (lastText) {
        context = await this.retrieveContext(lastText.substring(0, 500));
      }

      // 2. Inject Context
      if (context) {
        const memoryInstruction = `[Memory Context]:\n${context}`;

        if (config.config && config.config.systemInstruction) {
          let existing = config.config.systemInstruction;
          if (typeof existing === "string") {
            config.config.systemInstruction = `${existing}\n\n${memoryInstruction}`;
          } else if (existing.parts) {
            existing.parts.push({ text: `\n\n${memoryInstruction}` });
          }
        } else {
          if (!config.config) config.config = {};
          config.config.systemInstruction = {
            parts: [{ text: memoryInstruction }],
          };
        }
      }

      // 3. Call Original
      const response = await originalGenerate(config);

      // 4. Auto-Save
      if (lastText && response) {
        this.queueMemory(lastText, "user");

        try {
          let text = "";
          if (typeof response.text === "function") {
            text = response.text();
          } else if (typeof response.text === "string") {
            text = response.text;
          } else if (response.candidates && response.candidates.length > 0) {
            const parts = response.candidates[0].content?.parts;
            if (parts && parts.length > 0 && parts[0].text) {
              text = parts[0].text;
            }
          }

          if (text) this.queueMemory(text, "assistant");
        } catch (e) {
          this.logger.warn(
            "Failed to extract text from Google response for memory",
            e
          );
        }
      }

      return response;
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
