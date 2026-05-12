"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { buttonPrimary } from "../_components/ui";

// "Chat" — ask anything about your finances. The agent grounds answers in your real
// data (it calls the read tools) and shows its reasoning. Secondary surface.
export default function ChatScreen() {
  const { messages, sendMessage, status } = useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const suggestions = ["What's my runway?", "Should I shift more into USD right now?", "Where is my idle capital sitting?"];

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-4.75rem)] w-full max-w-md flex-col px-4 pt-4 md:h-[calc(100dvh-3.5rem)] md:max-w-lg md:px-6 md:pt-6">
      <div className="wf-rise shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-mut)]">Grounded in your data · shows its reasoning · not financial advice.</p>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-[var(--card)] p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-[13px] text-[var(--fg-faint)]">Ask something — or tap one:</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} className="rounded-full border border-line bg-[var(--bg-soft)] px-3 py-1.5 text-[12px] text-[var(--fg-dim)] transition hover:border-[var(--mint-dim)] hover:text-[var(--mint)]" onClick={() => { if (!busy) void sendMessage({ text: s }); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed " +
                  (isUser ? "bg-[var(--mint)] text-[#04130d]" : "bg-[var(--bg-soft)] text-[var(--fg-dim)] border border-line")
                }
              >
                {text || (busy ? "…" : "")}
              </div>
            </div>
          );
        })}
        {busy && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--fg-faint)]">
            <span className="wf-pulse h-1.5 w-1.5 rounded-full bg-[var(--mint)]" /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-3 mb-3 flex shrink-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = input.trim();
          if (!t || busy) return;
          setInput("");
          void sendMessage({ text: t });
        }}
      >
        <input
          className="flex-1 px-3.5 py-2.5 text-[14px]"
          placeholder="Ask about your finances…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} className={buttonPrimary("!px-4")}>Send</button>
      </form>
    </div>
  );
}
