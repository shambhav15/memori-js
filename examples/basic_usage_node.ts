import { Memori } from "../dist/index.js";
import OpenAI from "openai";

async function main() {
  console.log("Initializing Memori...");

  const memori = new Memori({
    googleApiKey: process.env.GOOGLE_API_KEY,
  });

  // const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // memori.llm.register(client, "openai");

  console.log("Adding memory...");
  await memori.addMemory("My favorite color is blue.", "user");

  console.log("Searching memory...");
  const results = await memori.search("What is my favorite color?");
  console.log("Search results:", results);

  // process.exit(0);
}

main().catch(console.error);
