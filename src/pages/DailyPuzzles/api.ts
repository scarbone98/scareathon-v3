// Talking to /daily-puzzles (server/routes/dailyPuzzles.js). The page never has an
// answer: it sends guesses and letters and gets back marks, and the server alone says
// what's solved and pays the tickets. That needs an account, so both puzzles ask
// guests to sign in.
import { useEffect, useState } from "react";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";

export type Game = "scaredle" | "cross-bones";
export type Mark = "correct" | "present" | "absent";

export type Play = { puzzle: number; done: boolean; won: boolean | null; score: number | null; tickets: number | null; tries: number; sameDay: boolean | null };
export type Archive = { today: number; nextInMs: number; plays: Play[] };
export type Reward = { tickets: number; coinBalance: number | null; sameDay: boolean } | null;

type Common = { puzzle: number; date: string; today: number; nextInMs: number; done: boolean; won: boolean | null; score: number | null; tickets: number | null; sameDay: boolean | null; reward?: Reward };
export type ScaredleView = Common & { guesses: string[]; marks: Mark[][]; answer: string | null };
export type Entry = { num: number; dir: "across" | "down"; row: number; col: number; length: number; clue: string };
export type Layout = { theme: string; rows: number; cols: number; mask: string; entries: Entry[] };
export type CrossBonesView = Common & { layout: Layout; fill: string; checks: number; revealed: number[]; elapsed: number; fullButWrong?: boolean; wrong?: number[] };

export const SAME_DAY_TICKETS = 100;
export const LATE_TICKETS = 10;

export class ApiError extends Error {}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetchWithAuth(`/daily-puzzles/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? "Couldn't reach the crypt. Try again?");
  return body as T;
}

// null while it's still looking
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

// Sign in happens on the site itself, outside the arcade cabinet's frame
export function goSignIn() {
  try {
    (window.top ?? window).location.href = "/authentication";
  } catch {
    window.location.href = "/authentication";
  }
}

// Which puzzle the address asks for (?n=3), or today's
export function puzzleFromUrl(): number | null {
  const n = Number(new URLSearchParams(window.location.search).get("n"));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function setPuzzleInUrl(n: number, today: number) {
  const url = new URL(window.location.href);
  if (n === today) url.searchParams.delete("n");
  else url.searchParams.set("n", String(n));
  window.history.replaceState(null, "", url);
}

export function formatPuzzleDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function dateOfPuzzle(n: number) {
  return new Date(Date.UTC(2026, 9, 7) + (n - 1) * 86_400_000).toISOString().slice(0, 10);
}

// Streak: solves on their own day, back to back, up to today (or yesterday, if today's
// isn't done yet)
export function streaks(plays: Play[], today: number) {
  const onTime = new Set(plays.filter((p) => p.won && p.sameDay).map((p) => p.puzzle));
  let best = 0;
  let run = 0;
  for (let n = 1; n <= today; n++) {
    run = onTime.has(n) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  for (let n = onTime.has(today) ? today : today - 1; n >= 1 && onTime.has(n); n--) current++;
  return { current, best };
}
