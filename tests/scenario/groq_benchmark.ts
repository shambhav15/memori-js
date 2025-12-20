import { Memori } from "../../src/core/memory";
import { existsSync, unlinkSync, readFileSync, statSync } from "fs";
import { EmbeddingProvider } from "../../src/core/types";

// --- CONFIG ---
const TEXT_FILE = "tests/scenario/long_conversation.txt";
const MODEL_NAME = "llama-3.1-8b-instant"; // Confirmed available in user screenshot
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Load Groq Key
const envConfig = readFileSync(".env", "utf-8");
const apiKeyMatch = envConfig.match(/GROQ_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : process.env.GROQ_API_KEY;

if (!apiKey) {
  console.error("❌ GROQ_API_KEY not found in .env!");
  console.error("👉 Please add GROQ_API_KEY=gsk_... to your .env file");
  process.exit(1);
}

// Mock Embedding (CPU only, fast)
class MockEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++)
      vec[i % 768] += text.charCodeAt(i) / 1000;
    return vec;
  }
}

// Helper: Call Groq via Fetch (No SDK needed)
async function callGroq(prompt: string): Promise<string> {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return (data as any).choices?.[0]?.message?.content || "";
  } catch (e) {
    console.warn("LLM Call Failed:", e);
    return "";
  }
}

// Stats Tracker
type RunStats = {
  insertTime: number;
  dbSize: number;
  totalStoredChars: number;
  compressionCalls: number;
};

async function runEngine(
  mode: "base" | "clara",
  chunks: string[],
  isClara: boolean
): Promise<RunStats> {
  const dbPath = `bench_groq_${mode}.db`;
  if (existsSync(dbPath)) unlinkSync(dbPath);

  let callCount = 0;

  const memori = new Memori({
    dbPath,
    embedding: new MockEmbedding(),
    llm: isClara
      ? {
          generate: async (p: any) => {
            callCount++;
            return await callGroq(p);
          },
        }
      : undefined,
    clara: isClara
      ? {
          enableCompression: true,
          enableReasoning: true,
          // Llama 3 is chatty, so we need a stricter prompt to force brevity
          compressorPrompt:
            "Compress the following text into the absolute minimum characters needed to retain the key facts. Use semi-colons to separate facts. Do not use bullet points. Do not mention 'The text says'. Output ONLY the facts.",
          compressor: {
            generate: async (p: any) => {
              callCount++;
              const res = await callGroq(p);
              // Log the first one to verify quality
              if (callCount === 1)
                console.log(
                  `\n[DEBUG SAMPLE] Input: "${p.substring(
                    p.length - 50
                  )}..." \n[DEBUG SAMPLE] Output: "${res}"`
                );
              return res;
            },
          },
        }
      : undefined,
  });

  await memori.config.storage.build();

  const start = Date.now();
  for (const chunk of chunks) {
    process.stdout.write(".");
    await memori.addMemory(chunk);
  }
  const end = Date.now();

  // Estimate stored size (mock)
  // @ts-ignore
  const rows = await new Promise<any[]>((r) =>
    (memori as any).db.db.all(
      "SELECT content FROM memories",
      (_: any, res: any) => r(res || [])
    )
  );
  const totalStoredChars = rows.reduce(
    (acc, row) => acc + row.content.length,
    0
  );

  return {
    insertTime: end - start,
    dbSize: statSync(dbPath).size,
    totalStoredChars,
    compressionCalls: callCount,
  };
}

async function runTest() {
  console.log(`🚀 STARTING GROQ BENCHMARK (${MODEL_NAME})`);

  const rawText = readFileSync(TEXT_FILE, "utf-8");
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 4)
    chunks.push(lines.slice(i, i + 4).join("\n"));

  console.log(`🔹 Processing ${chunks.length} chunks...`);

  // BASELINE
  console.log("\n▶️  RUNNING BASELINE...");
  const baseStats = await runEngine("base", chunks, false);

  // CLaRa
  console.log("\n▶️  RUNNING CLaRa (Groq Llama 3.3)...");
  const claraStats = await runEngine("clara", chunks, true); // This will run SUPER FAST on Groq

  // REPORT
  console.log("\n\n🏆 PERFORMANCE REPORT 🏆");
  console.table([
    {
      Metric: "Result Size (Chars)",
      Baseline: baseStats.totalStoredChars,
      CLaRa: claraStats.totalStoredChars,
      Diff: `${(
        ((claraStats.totalStoredChars - baseStats.totalStoredChars) /
          baseStats.totalStoredChars) *
        100
      ).toFixed(1)}%`,
    },
    {
      Metric: "Insert Time (ms)",
      Baseline: baseStats.insertTime,
      CLaRa: claraStats.insertTime,
      Diff: `${(
        ((claraStats.insertTime - baseStats.insertTime) /
          baseStats.insertTime) *
        100
      ).toFixed(1)}%`,
    },
  ]);

  // Cleanup
  if (existsSync("bench_groq_base.db")) unlinkSync("bench_groq_base.db");
  if (existsSync("bench_groq_clara.db")) unlinkSync("bench_groq_clara.db");
}

runTest();
