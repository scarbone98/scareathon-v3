import { supabase } from "./supabaseClient";

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const baseUrl = import.meta.env.VITE_BASE_URL || "";
  const url =
    typeof input === "string" ? new URL(input, baseUrl).toString() : input;

  return fetch(url, { ...init, headers });
}
