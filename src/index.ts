import { Elysia } from "elysia";
import { memoriPlugin } from "./plugin";
import OpenAI from "openai";

// Export the Library for import usage
export * from "./plugin";

// Only start server if this file is main entry (running as app)
if (import.meta.main) {
  const app = new Elysia()
    .use(memoriPlugin())
    .post("/chat", async ({ body, memori, withMemory }) => {
      const { message } = body as { message: string };

      // Example of using the Proxy
      // Note: In real app, you might re-use a global client
      const client = new OpenAI();
      const agent = withMemory(client);

      const response = await agent.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      });

      const reply =
        "choices" in response
          ? response.choices[0].message.content
          : "Streaming not supported in this demo";

      return {
        reply,
        // Debug: search what was found
        // context: await memori.search(message)
      };
    })
    .get("/memories", async ({ memori, query }) => {
      const q = (query as any).q || "";
      if (!q) return [];
      return await memori.search(q);
    })
    .listen(3000);

  console.log(
    `🦊 Memori Server is running at ${app.server?.hostname}:${app.server?.port}`
  );
}
