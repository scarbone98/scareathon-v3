import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { FighterSide } from "../../../server/shared/monster-bash/index.js";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";

export type BetStatus = "open" | "won" | "lost" | "refunded";

export type PlayerBet = {
  side: FighterSide;
  amount: number;
  status: BetStatus;
  payout: number | null;
};

export type PlayerAccount = {
  balance: number;
  bet: PlayerBet | null;
  matchId: string | null;
  limits: { minBet: number; maxBet: number };
};

type ApiError = { error: string; message?: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.message || "Something went wrong. Try again.");
  }
  return body as T;
}

export async function placeBet(bet: { matchId: string; side: FighterSide; amount: number }) {
  const response = await fetchWithAuth("/monster-bash/bets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bet),
  });
  return readJson<{ bet: PlayerBet & { matchId: string }; balance: number }>(response);
}

export async function sendChat(text: string) {
  const response = await fetchWithAuth("/monster-bash/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return readJson<unknown>(response);
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

// The player's coins and bet, refreshed whenever the bout changes or bets are
// paid out. `setAccount` lets the bet slip apply a placed bet immediately.
export function usePlayerAccount(signedIn: boolean, matchId: string | null, settledMatchId: string | null) {
  const [account, setAccount] = useState<PlayerAccount | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/monster-bash/me");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setAccount((await response.json()) as PlayerAccount);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setAccount(null);
      return;
    }
    refresh();
  }, [signedIn, matchId, settledMatchId, refresh]);

  return { account, setAccount, failed, refresh };
}
