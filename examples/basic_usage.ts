import { Memori } from "../src/index";
import { GoogleGenAI } from "@google/genai";

// MOCK ADAPTER: Making Google GenAI look like OpenAI for Memori
// This satisfies "Use Google not OpenAI" while keeping Memori's OpenAI-centric API for now.
class GoogleOpenAIAdapter {
  private googleClient: GoogleGenAI;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY required");
    this.googleClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  chat = {
    completions: {
      create: async (body: any) => {
        const model = "gemini-2.5-flash";
        const messages = body.messages;

        // Convert OpenAI messages to Google Generative AI content
        // Simulating a simple turn-based conversation or just sending the last prompt
        // For better simulation, we should build the history.

        // Very simplified conversion:
        let fullPrompt = "";
        let systemInstruction = "";

        for (const msg of messages) {
          if (msg.role === "system") systemInstruction += msg.content + "\n";
          else fullPrompt += `${msg.role}: ${msg.content}\n`;
        }

        console.log(
          `[Google Adapter] Sending prompt to Gemini: ${JSON.stringify(
            messages[messages.length - 1]
          )}`
        );

        // Direct Gemini Call
        // Note: The actual google-genai SDK usage might differ slightly
        const response = await this.googleClient.models.generateContent({
          model: model,
          contents: [
            {
              role: "user",
              parts: [{ text: systemInstruction + "\n" + fullPrompt }],
            },
          ],
        });

        // Check if candidates exist
        const text =
          response.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

        // Return OpenAI-shape response
        return {
          choices: [
            {
              message: {
                content: text,
                role: "assistant",
              },
            },
          ],
        };
      },
    },
  };
}

async function main() {
  console.log("Initializing Google-based Adapter...");
  // @ts-ignore
  const client = new GoogleOpenAIAdapter();

  console.log("Initializing Memori...");
  // Assumes GOOGLE_API_KEY is set in env for embeddings
  const memori = new Memori().llm.register(client as any);

  memori.attribution("user-123", "demo-process");
  await memori.config.storage.build();

  console.log("\n--- Turn 1: Teaching ---\n");
  const response1 = await client.chat.completions.create({
    model: "gpt-3.5-turbo", // Ignored by adapter
    messages: [{ role: "user", content: "My favorite color is blue." }],
  });

  // @ts-ignore
  console.log("AI:", response1.choices[0].message.content);

  console.log("\nWaiting for augmentation (saving memories)...\n");
  await memori.augmentation.wait();

  console.log("\n--- Turn 2: Recalling ---\n");
  const response2 = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "What is my favorite color?" }],
  });

  // @ts-ignore
  console.log("AI:", response2.choices[0].message.content);
}

main().catch(console.error);
