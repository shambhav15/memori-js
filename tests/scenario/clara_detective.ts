import { Memori } from "../../src/core/memory";
import { GoogleGenAI } from "@google/genai";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { EmbeddingProvider } from "../../src/core/types";

// Load Env
const envConfig = readFileSync(".env", "utf-8");
const apiKeyMatch = envConfig.match(/MEMORI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : process.env.MEMORI_API_KEY;

if (!apiKey) {
  console.error("❌ MEMORI_API_KEY not found!");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });
const modelName = "gemini-2.0-flash-exp";

// --- Mock Embedding for Consistency ---
class MockEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(768).fill(0);
    // Simple mock: spread char codes to simulate semantic vector
    for (let i = 0; i < text.length; i++) {
      vec[i % 768] += text.charCodeAt(i) / 1000;
    }
    return vec;
  }
}

async function runScenario() {
  console.log("🕵️  STARTING DETECTIVE SCENARIO 🕵️");
  console.log("-------------------------------------");

  // The Document: A messy transcript with a hidden key fact
  const noisyDocument = `
    [TRANSCRIPT - OFFICE LUNCH BREAK]
    Bob: Hey, does anyone want pizza?
    Alice: I'm gluten free usually, but sure.
    Bob: Okay, ordering from Joe's.
    Manager: By the way, before I forget—for the client demo tomorrow, the admin password is 'VelvetThunder'. Don't write it down.
    Bob: Did you say pepperoni?
    Alice: Yeah, and mushrooms.
    Manager: Also, the coffee machine is broken again. 
    Bob: Classic. 
    [END TRANSCRIPT]
    `;

  // The "Difficult" Question: Uses different words than the text
  const confusingQuery = "What are the credentials for the presentation?";

  console.log("\n📄 THE DOCUMENT:");
  console.log(noisyDocument.trim());
  console.log("\n❓ THE USER QUERY:");
  console.log(`"${confusingQuery}"`);
  console.log(
    "\n(Note: The text says 'client demo' and 'admin password', but query asks 'credentials' and 'presentation'.)"
  );

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // --- 1. BASELINE ---
  console.log("\n\n🔴 RUNNING BASELINE (Standard Vector Search)...");
  const dbPathBase = "scenario_base.db";
  if (existsSync(dbPathBase)) unlinkSync(dbPathBase);

  const memoriBase = new Memori({
    dbPath: dbPathBase,
    embedding: new MockEmbedding(),
  });
  await memoriBase.config.storage.build();
  await memoriBase.addMemory(noisyDocument);

  const resBase = await memoriBase.search(confusingQuery, 1);
  console.log("   > Baseline Retrieval:");
  if (resBase[0]) {
    console.log(
      `   [Score: ${resBase[0].distance.toFixed(
        4
      )}] Content: "${resBase[0].content.substring(0, 50)}..."`
    );
  } else {
    console.log("   [No Result]");
  }

  // --- 2. CLaRa ---
  console.log("\n\n🟢 RUNNING CLaRa (Reasoning + Compression)...");
  const dbPathClara = "scenario_clara.db";
  if (existsSync(dbPathClara)) unlinkSync(dbPathClara);

  const memoriClara = new Memori({
    dbPath: dbPathClara,
    embedding: new MockEmbedding(),
    llm: {
      generate: async (p: any) => {
        const r = await genAI.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: p }] }],
        });
        // @ts-ignore
        return r.text || "";
      },
    },
    clara: {
      enableCompression: true,
      enableReasoning: true,
      compressor: {
        generate: async (p: any) => {
          const r = await genAI.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: p }] }],
          });
          // @ts-ignore
          return r.text || "";
        },
      },
    },
  });

  await memoriClara.config.storage.build();

  console.log("   > Ingesting (Compressing)...");
  await memoriClara.addMemory(noisyDocument);
  await delay(2000); // Rate limit safety

  console.log("   > Searching (Reasoning)...");
  const resClara = await memoriClara.search(confusingQuery, 1);

  console.log("   > CLaRa Retrieval:");
  if (resClara[0]) {
    // In CLaRa, the 'content' is the compressed fact
    console.log(
      `   [Score: ${resClara[0].distance.toFixed(4)}] VECTOR CONTENT: "${
        resClara[0].content
      }"`
    );
    console.log(
      `   FULL ORIGINAL: "${resClara[0].metadata?.original_content?.substring(
        0,
        50
      )}..."`
    );
  } else {
    console.log("   [No Result]");
  }

  // Cleanup
  if (existsSync(dbPathBase)) unlinkSync(dbPathBase);
  if (existsSync(dbPathClara)) unlinkSync(dbPathClara);
}

runScenario();
