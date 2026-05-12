import { createUIMessageStreamResponse } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { createChatAgent } from "@/src/mastra";
import { requireApiUser } from "@/src/lib/api";

// Streams the chat agent's response in AI SDK v6 UI-message format (consumed by
// useChat on /chat). The agent is built per request, scoped to the signed-in user:
// its tools only see that user's data, and memory is keyed by the user's id.
export async function POST(req: Request) {
  let user;
  try {
    user = await requireApiUser();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const agent = createChatAgent(user.id);
  const result = await agent.stream(messages as never, {
    // per-user memory: one persistent thread per user (cross-session continuity)
    memory: { resource: user.id, thread: `wealthflow:${user.id}` },
  });

  const uiStream = toAISdkStream(result, { from: "agent", version: "v6" });
  return createUIMessageStreamResponse({ stream: uiStream as never });
}
