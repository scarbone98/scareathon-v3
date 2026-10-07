import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "../../fetchWithAuth";

export type Wallet = {
  balance: number;
  limits: { minBet: number; maxBet: number };
};

// What every house game needs from the casino floor: who's playing and their coins.
export type RoomProps = {
  signedIn: boolean;
  wallet: Wallet | null;
  walletFailed: boolean;
  retryWallet: () => void;
  setBalance: (balance: number) => void;
};

export class CasinoError extends Error {
  code: string;
  body: Record<string, unknown>;

  constructor(body: Record<string, unknown>) {
    super(typeof body.message === "string" ? body.message : "Something went wrong. Try again.");
    this.code = typeof body.error === "string" ? body.error : "unknown";
    this.body = body;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new CasinoError(body as Record<string, unknown>);
  return body as T;
}

export async function casinoGet<T>(path: string) {
  return readJson<T>(await fetchWithAuth(`/casino${path}`));
}

export async function casinoPost<T>(path: string, body: unknown) {
  const response = await fetchWithAuth(`/casino${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(response);
}

export const formatCoins = (coins: number) => coins.toLocaleString("en-US");

// The most a player can put on one round right now.
export const maxStake = (wallet: Wallet) => Math.min(wallet.limits.maxBet, wallet.balance);

// The look of a panel on the casino floor (the same as Monster Bash's).
export const PANEL = "rounded-lg border border-purple-900/60 bg-black/60";

export const errorMessage = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

// Sign in happens on the site itself, outside the arcade cabinet's frame
export function goSignIn() {
  try {
    (window.top ?? window).location.href = "/authentication";
  } catch {
    window.location.href = "/authentication";
  }
}

// The player's coins at the house games. Rooms push the balance each round
// returns; it's re-read whenever `place` changes.
export function useWallet(signedIn: boolean, place: string | null) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setWallet(await casinoGet<Wallet>("/me"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setWallet(null);
      return;
    }
    refresh();
  }, [signedIn, place, refresh]);

  const setBalance = useCallback((balance: number) => {
    setWallet((current) => (current ? { ...current, balance } : current));
  }, []);

  return { wallet, failed, refresh, setBalance };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
