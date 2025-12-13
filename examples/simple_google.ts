import { Memori } from "../src/index";
import { GoogleGenAI } from "@google/genai";

// Ensure keys
const googleKey = process.env.GOOGLE_API_KEY || ""; // Fallback for demo
const memoriKey = process.env.MEMORI_API_KEY || googleKey;

async function main() {
  console.log("--- Memori Simple Google Demo ---");

  // 1. Initialize Memori
  const memori = new Memori({ apiKey: memoriKey });
  await memori.config.storage.build();

  // 2. Initialize Google Client
  const client = new GoogleGenAI({ apiKey: googleKey });

  // 3. Register (Auto-Detect!)
  // matches: mem = Memori(...).llm.register(client)
  memori.llm.register(client);
  console.log("✅ Client registered (Provider auto-detected)");

  // 4. Teach
  console.log("Teaching: I maybe a  software engineer.");
  await memori.addMemory(" am i an engineer?");

  // 5. Ask
  console.log("Asking: Who am I?");
  const result = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: "Who am I?" }] }],
  });

  // Safe extraction as per previous fix
  const text =
    typeof result.text === "string"
      ? result.text
      : result.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("\n🤖 Response:", text);
}

main().catch(console.error);
