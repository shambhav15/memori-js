import { Memori, PostgresVecStore } from "../dist/index.js";
import OpenAI from "openai";

// Example Usage with Cloud Postgres (Supabase, Neon, RDS)
async function main() {
  // 1. Initialize Postgres Adapter
  // Connection string format: postgres://user:password@host:port/database
  const pgStore = new PostgresVecStore(process.env.DATABASE_URL!);

  // 2. Initialize Memori with the store
  const memori = new Memori({
    googleApiKey: process.env.GOOGLE_API_KEY,
    vectorStore: pgStore, // Inject the adapter
  });

  // 3. Initialize the Store (connects, creates tables if missing)
  await pgStore.init();

  // 4. Register LLM (optional, for Autonomy)
  // const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // memori.llm.register(client, "openai");

  console.log("Memori initialized with Postgres!");

  // 5. Use API as normal
  // await memori.addMemory("This memory lives in the cloud!", "user");
  // const results = await memori.search("Where does this memory live?");

  // console.log(results);

  // Cleanup
  await pgStore.close();
}

// main().catch(console.error);
