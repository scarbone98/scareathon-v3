import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";

export type Board = "general" | "scareathon";

export type Reaction = { emoji: string; count: number; mine: boolean };

export type Post = {
  id: string;
  board: Board;
  parentId: string | null;
  userId: string | null;
  username: string | null;
  body: string | null;
  removed: boolean;
  createdAt: string;
  mine: boolean;
  canRemove: boolean;
  reactions: Reaction[];
  replyCount?: number;
  lastReplyAt?: string | null;
};

export type BoardPage = { admin: boolean; signedIn: boolean; reactions: string[]; threads: Post[]; hasMore: boolean };
export type Thread = { admin: boolean; signedIn: boolean; reactions: string[]; post: Post; replies: Post[] };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return body as T;
}

export async function loadBoard(board: Board, before?: string) {
  const query = new URLSearchParams({ board });
  if (before) query.set("before", before);
  return readJson<BoardPage>(await fetchWithAuth(`/wayside-online/threads?${query}`));
}

export async function loadThread(id: string) {
  return readJson<Thread>(await fetchWithAuth(`/wayside-online/threads/${id}`));
}

export async function sendPost(post: { board?: Board; parentId?: string; body: string }) {
  return readJson<{ id: string; createdAt: string }>(
    await fetchWithAuth("/wayside-online/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post),
    })
  );
}

export async function react(id: string, emoji: string) {
  return readJson<{ reacted: boolean; reactions: Reaction[] }>(
    await fetchWithAuth(`/wayside-online/posts/${id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    })
  );
}

export async function takeDown(id: string) {
  return readJson<{ removed: string }>(await fetchWithAuth(`/wayside-online/posts/${id}`, { method: "DELETE" }));
}

// The signed-in Supabase session, or null for guests. `undefined` while loading.
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return session;
}

// "just now", "5m", "3h", "2d", then the date
export function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
