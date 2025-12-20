import { Memori } from "../../src/core/memory";
import { GoogleGenAI } from "@google/genai";
import { existsSync, unlinkSync, statSync, readFileSync } from "fs";
import { EmbeddingProvider } from "../../src/core/types";

// Load Env
const envConfig = readFileSync(".env", "utf-8");
const apiKeyMatch = envConfig.match(/MEMORI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : process.env.MEMORI_API_KEY;

if (!apiKey) {
  console.error("❌ MEMORI_API_KEY not found in .env or environment!");
  process.exit(1);
}

// Clients
const genAI = new GoogleGenAI({ apiKey });
// User requested Gemma specifically due to Flash availability issues
const flashModelName = "gemini-2.0-flash-exp";

// We still use MockEmbedding for the vector part to isolate LLM latency comparison
// and avoid hitting embedding quotas for 1000 items if not needed.
// Only the LLM part is "Real" CLaRa.
class MockEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 768] += text.charCodeAt(i) / 1000;
    }
    return vec;
  }
}

// Data Generator: Creates "News-like" snippets for better summarization testing
function generateDataset(size: number) {
  const data = [];
  const topics = ["Technology", "Politics", "Sports", "Science", "Arts"];
  for (let i = 0; i < size; i++) {
    const topic = topics[i % topics.length];
    const junk =
      `This is a filler sentence about ${topic} that contains no real value but takes up space. `.repeat(
        3
      );
    const fact = `Breaking News in ${topic}: Key event #${i} occurred today affecting standard operations.`;
    data.push(`${junk} ${fact} ${junk}`);
  }
  return data;
}

async function runBenchmark() {
  console.log(`Starting CLaRa Benchmark (Real ${flashModelName})...`);

  // REDUCED SIZE FOR REAL API
  const datasetSize = 25; // Reducing further to 25 to be safe on time/rate limits
  console.log(
    `Dataset Size: ${datasetSize} items (Warning: Real API calls take time!)`
  );

  const data = generateDataset(datasetSize);
  const mockEmbed = new MockEmbedding();
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  // --- Phase 1: Baseline (No CLaRa) ---
  console.log("\n==================================");
  console.log("PHASE 1: BASELINE (Standard RAG)");
  console.log("==================================");
  const dbPathBaseline = "benchmark_baseline.db";
  if (existsSync(dbPathBaseline)) unlinkSync(dbPathBaseline);

  const memoriBaseline = new Memori({
    dbPath: dbPathBaseline,
    embedding: mockEmbed,
    // clara: undefined
  });
  await memoriBaseline.config.storage.build();

  console.log(`> Inserting ${datasetSize} items...`);
  const startBase = Date.now();
  let baseTokensStored = 0;
  for (const item of data) {
    await memoriBaseline.addMemory(item);
    baseTokensStored += estimateTokens(item);
    process.stdout.write(".");
  }
  const timeBase = Date.now() - startBase;
  const sizeBase = statSync(dbPathBaseline).size;
  console.log(`\n> Done (${timeBase}ms).`);

  // Check retrieval
  console.log(`> Retrieving...`);
  let baseContextChars = 0;
  for (let i = 0; i < 5; i++) {
    const res = await memoriBaseline.search(`event #${i}`, 1);
    if (res[0]) baseContextChars += res[0].content.length;
  }
  const baseAvgContextTokens = estimateTokens(baseContextChars.toString()) / 5;

  // --- Phase 2: CLaRa Enabled (Real API) ---
  console.log("\n==================================");
  console.log(`PHASE 2: CLaRa (${flashModelName})`);
  console.log("==================================");
  const dbPathClara = "benchmark_clara.db";
  if (existsSync(dbPathClara)) unlinkSync(dbPathClara);

  const memoriClara = new Memori({
    dbPath: dbPathClara,
    embedding: mockEmbed,
    // Main LLM for Reasoning
    llm: {
      generate: async (prompt: any) => {
        const res = await genAI.models.generateContent({
          model: flashModelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        // @ts-ignore
        return res.text || "";
      },
    },
    clara: {
      enableCompression: true,
      enableReasoning: true,
      // Dedicated compressor (also Flash)
      compressor: {
        generate: async (prompt: any) => {
          const res = await genAI.models.generateContent({
            model: flashModelName,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          });
          // @ts-ignore
          return res.text || "";
        },
      },
    },
  });

  await memoriClara.config.storage.build();

  console.log(`> Inserting ${datasetSize} items (calling API)...`);
  const startClara = Date.now();

  // CRITICAL FIX: Run sequentially to avoid SQLite transaction locks
  // AND: Add delay to respect Gemini API Rate Limits (10-15 RPM for free/exp)
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  for (const item of data) {
    await memoriClara.addMemory(item);
    process.stdout.write(".");
    // Wait 4 seconds between requests to stay safe under 15 RPM
    await delay(4000);
  }

  const timeClara = Date.now() - startClara;
  const sizeClara = statSync(dbPathClara).size;
  console.log(`\n> Done (${timeClara}ms).`);

  console.log(`> Retrieving (with Reasoning)...`);
  let claraContextChars = 0;
  for (let i = 0; i < 5; i++) {
    const res = await memoriClara.search(`standard operations event #${i}`, 1);
    if (res[0]) claraContextChars += res[0].content.length;
  }
  const claraAvgContextTokens = estimateTokens(
    (claraContextChars / 5).toString()
  );

  // --- Report ---
  console.log("\n\n");
  console.table([
    {
      Metric: "Insert Time (ms)",
      Baseline: `${timeBase}`,
      CLaRa: `${timeClara}`,
      Diff: `${(((timeClara - timeBase) / timeBase) * 100).toFixed(1)}%`,
    },
    {
      Metric: "DB Size (KB)",
      Baseline: (sizeBase / 1024).toFixed(2),
      CLaRa: (sizeClara / 1024).toFixed(2),
      Diff: `${(((sizeClara - sizeBase) / sizeBase) * 100).toFixed(2)}%`,
    },
    {
      Metric: "Avg Context (Tokens)",
      Baseline: baseAvgContextTokens.toFixed(1),
      CLaRa: claraAvgContextTokens.toFixed(1),
      Diff: `${(
        ((claraAvgContextTokens - baseAvgContextTokens) /
          baseAvgContextTokens) *
        100
      ).toFixed(1)}%`,
    },
  ]);

  // Cleanup
  unlinkSync(dbPathBaseline);
  unlinkSync(dbPathClara);
}

runBenchmark().catch((e) => {
  console.error(e);
  process.exit(1);
});
