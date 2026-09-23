import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { sendChat } from "./account";
import type { ChatMessage } from "./matchStore";

const MAX_LENGTH = 200;
// How close to the bottom counts as "following along" for auto-scroll.
const STICKY_PX = 48;

export default function Chat({ messages, signedIn, className = "" }: { messages: ChatMessage[]; signedIn: boolean; className?: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Follow new messages unless the reader scrolled up to look at older ones.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await sendChat(message);
      setText("");
      stickToBottom.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-purple-900/60 bg-black/60 ${className}`}>
      <h2 className="border-b border-purple-900/50 px-4 py-3 text-lg font-bold text-orange-50">Arena chat</h2>
      <ol
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICKY_PX;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3 text-sm"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && <li className="text-purple-200/60">No messages yet. Say something spooky.</li>}
        {messages.map((message) =>
          message.system ? (
            <li key={message.id} className="text-amber-200/90">
              {message.text}
            </li>
          ) : (
            <li key={message.id} className="break-words text-orange-100/90">
              <strong className="mr-1.5 text-purple-200">{message.name}</strong>
              {message.text}
            </li>
          )
        )}
      </ol>
      <div className="border-t border-purple-900/50 p-3">
        {signedIn ? (
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={MAX_LENGTH}
              placeholder="Cheer on your monster"
              aria-label="Chat message"
              className="w-full min-w-0 rounded-md border border-purple-800 bg-black/60 px-3 py-2 text-sm text-orange-50"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="rounded-md bg-purple-800 px-3 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        ) : (
          <Link to="/authentication" state={{ from: "/monster-bash" }} className="text-sm text-purple-200 underline">
            Sign in to chat
          </Link>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
