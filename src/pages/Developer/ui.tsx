import type { ReactNode } from "react";
import { fetchWithAuth } from "../../fetchWithAuth";

// Bits shared by the profile's Developer tab and /arcade/connect.

export type Check = { id: string; label: string; ok: boolean; level: "error" | "warning"; detail?: string };

export class ArcadeApiError extends Error {
  constructor(message: string, public details: { errors?: string[]; checks?: Check[] } = {}) {
    super(message);
  }
}

export async function arcadeApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetchWithAuth(path, {
    method: init?.method ?? "GET",
    ...(init?.body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
      : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ArcadeApiError(payload.error || `Request failed (${response.status})`, payload);
  }
  return payload.data as T;
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never";
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#443c50] bg-[#1d1a24] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-orange-200">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-orange-500/70 bg-black/60 px-3 py-1.5 text-sm font-semibold text-orange-100 transition hover:border-orange-300 hover:bg-orange-950 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-bold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50";
