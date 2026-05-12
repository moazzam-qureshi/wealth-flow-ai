import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { getMastra, CHAT_AGENT_ID } from "@/src/mastra";
import { requireApiUser } from "@/src/lib/api";

// Streams the chat agent's response in AI SDK v6 UI-message format (consumed by
// useChat on /chat). Auth: must be signed in (it reads the user's financial data).
export async function POST(req: Request) {
  try {
    await requireApiUser();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  // version "v6" → returns a UIMessage stream; wrap it into an SSE Response.
  const stream = await handleChatStream({
    mastra: getMastra(),
    agentId: CHAT_AGENT_ID,
    version: "v6",
    params: { messages: messages as never },
  });
  return createUIMessageStreamResponse({ stream: stream as never });
}
