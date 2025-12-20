import { Memori } from "../../src/core/memory";
import { existsSync, unlinkSync, readFileSync, statSync } from "fs";
import { EmbeddingProvider } from "../../src/core/types";

// --- CONFIG ---
const TEXT_FILE = "tests/scenario/long_conversation.txt";
const MODEL_NAME = "gemma2";
const OLLAMA_API_URL = "http://localhost:11434/api/generate";

// Mock Embedding (CPU only, fast)
class MockEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++)
      vec[i % 768] += text.charCodeAt(i) / 1000;
    return vec;
  }
}

// Helper: Call Ollama
async function callOllama(prompt: string): Promise<string> {
  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || "";
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
  const dbPath = `bench_local_${mode}.db`;
  if (existsSync(dbPath)) unlinkSync(dbPath);

  let callCount = 0;

  const memori = new Memori({
    dbPath,
    embedding: new MockEmbedding(),
    llm: isClara
      ? {
          generate: async (p: any) => {
            callCount++;
            return await callOllama(p);
          },
        }
      : undefined,
    clara: isClara
      ? {
          enableCompression: true,
          enableReasoning: true,
          // Gemma 2 is quite smart, but let's keep the strict prompt to be safe
          compressorPrompt:
            "Compress the following text into the absolute minimum characters needed to retain the key facts. Use semi-colons to separate facts. Do not use bullet points. Do not mention 'The text says'. Output ONLY the facts.",
          compressor: {
            generate: async (p: any) => {
              callCount++;
              const res = await callOllama(p);
              if (callCount === 1)
                console.log(`\n[DEBUG SAMPLE] Output: "${res}"`);
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
    (memori as any).db.db.all("SELECT content FROM memories", (_: any, res: any) =>
      r(res || [])
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
  console.log(`🏠 STARTING LOCAL BENCHMARK (${MODEL_NAME})`);
  console.log(`(Ensure 'ollama serve' is running in background)`);

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
  console.log("\n▶️  RUNNING CLaRa (Local Gemma 2)...");
  const claraStats = await runEngine("clara", chunks, true);

  // REPORT
  console.log("\n\n🏆 LOCAL PERFORMANCE REPORT 🏆");
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
  if (existsSync("bench_local_base.db")) unlinkSync("bench_local_base.db");
  if (existsSync("bench_local_clara.db")) unlinkSync("bench_local_clara.db");
}

runTest();
