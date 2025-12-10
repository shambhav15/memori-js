import OpenAI from "openai";
import { Memori } from "./memory";

/**
 * Creates a Proxy around the OpenAI client to auto-inject memory.
 */
export function createMemoriProxy(client: OpenAI, memori: Memori): OpenAI {
  return new Proxy(client, {
    get(target, prop, receiver) {
      // Intercept 'chat' property
      if (prop === "chat") {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp) {
            // Intercept 'completions.create'
            if (chatProp === "completions") {
              return {
                create: async (
                  args: OpenAI.Chat.ChatCompletionCreateParams
                ) => {
                  return handleChatCompletion(
                    chatTarget.completions,
                    args,
                    memori
                  );
                },
              };
            }
            return Reflect.get(chatTarget, chatProp);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function handleChatCompletion(
  completions: OpenAI.Chat.Completions,
  args: OpenAI.Chat.ChatCompletionCreateParams,
  memori: Memori
) {
  // 1. EXTRACT QUERY
  // Find the last user message
  const lastMsg = args.messages
    .slice()
    .reverse()
    .find((m) => m.role === "user");
  let context = "";

  if (lastMsg && typeof lastMsg.content === "string") {
    const query = lastMsg.content;

    // 2. SEARCH MEMORY
    try {
      const results = await memori.search(query, 5);
      if (results.length > 0) {
        context = results
          .map((r) => `- ${r.content} (score: ${r.distance})`)
          .join("\n");
        // console.log("Injecting Context:", context);
      }
    } catch (e) {
      console.error("Memori search failed:", e);
    }
  }

  // 3. INJECT CONTEXT
  // Add a system message with context if found
  const newMessages = [...args.messages];
  if (context) {
    newMessages.unshift({
      role: "system",
      content: `Use the following memory context to answer the user if relevant:\n${context}`,
    });
  }

  // 4. EXECUTE CALL
  const response = await completions.create({
    ...args,
    messages: newMessages,
  });

  // 5. AUTO-SAVE (Background)
  if (lastMsg && typeof lastMsg.content === "string") {
    memori
      .addMemory(lastMsg.content, "user")
      .catch((e) => console.error("Failed to save user memory", e));

    // Type guard for non-streaming response
    if ("choices" in response) {
      const aiContent = response.choices[0].message.content;
      if (aiContent) {
        memori
          .addMemory(aiContent, "assistant")
          .catch((e) => console.error("Failed to save AI memory", e));
      }
    }
  }

  return response;
}
