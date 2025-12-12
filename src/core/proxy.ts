import OpenAI from "openai";
import { Memori } from "./memory";

/**
 * Creates a transparent Proxy around the OpenAI client.
 * This interceptor automatically injects relevant memory context into the chat messages
 * and saves new interactions to the vector store, without requiring the user to manually change their code.
 *
 * @param client - The original OpenAI client instance.
 * @param memori - The Memori instance to use for storage and retrieval.
 * @returns A proxied OpenAI client that behaves exactly like the original but with memory superpowers.
 */
export function createMemoriProxy(client: OpenAI, memori: Memori): OpenAI {
  return new Proxy(client, {
    get(target, prop, receiver) {
      // Intercept access to the 'chat' property
      if (prop === "chat") {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp) {
            // Intercept access to 'completions'
            if (chatProp === "completions") {
              return {
                // Return a wrapper around the 'create' method
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
            // Pass through all other properties (e.g., chatTarget.otherProp)
            return Reflect.get(chatTarget, chatProp);
          },
        });
      }
      // Pass through all other properties (e.g., client.models, client.images)
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Handles the logic for a proxied chat completion request.
 * 1. Extracts the user's last message.
 * 2. Retrieves relevant context from Memori.
 * 3. Injects context into the system prompt.
 * 4. Calls the original OpenAI API.
 * 5. Saves the conversation to memory in the background.
 */
async function handleChatCompletion(
  completions: OpenAI.Chat.Completions,
  args: OpenAI.Chat.ChatCompletionCreateParams,
  memori: Memori
) {
  // 1. EXTRACT QUERY
  // Find the last user message to use as the search query
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

    // Type guard for non-streaming response; saving assistant memory
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
