import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import type { PictoStyle } from "./filter";

export type Photo = {
  id: string;
  username: string;
  style: PictoStyle;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return body as T;
}

export function photoUrl(id: string) {
  const base = (import.meta.env.VITE_BASE_URL || "").replace(/\/$/, "");
  return `${base}/picto-box/photos/${id}.jpg`;
}

export async function loadWall() {
  return readJson<{ admin: boolean; photos: Photo[] }>(await fetchWithAuth("/picto-box/photos"));
}

export async function postPhoto(image: string, style: PictoStyle) {
  return readJson<{ id: string; createdAt: string }>(
    await fetchWithAuth("/picto-box/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, style }),
    })
  );
}

export async function removePhoto(id: string) {
  return readJson<{ deleted: string }>(await fetchWithAuth(`/picto-box/photos/${id}`, { method: "DELETE" }));
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

// "just now", "5m ago", "3h ago"
export function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// Hours left before a photo comes down (they last a day)
export function hoursLeft(iso: string) {
  return Math.max(0, Math.ceil(24 - (Date.now() - new Date(iso).getTime()) / 3600000));
}
