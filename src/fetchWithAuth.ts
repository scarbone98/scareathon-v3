import { isRetryableAuthError } from "./authErrors";
import { supabase } from "./supabaseClient";
import type { Session } from "@supabase/supabase-js";

let refreshPromise: Promise<Session | null> | null = null;

function buildApiUrl(input: RequestInfo) {
  const baseUrl = import.meta.env.VITE_BASE_URL || "";
  return typeof input === "string"
    ? `${baseUrl.replace(/\/$/, "")}/${input.replace(/^\//, "")}`
    : input;
}

async function fetchWithAccessToken(
  input: RequestInfo,
  init: RequestInit | undefined,
  accessToken: string | undefined
) {
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(buildApiUrl(input), { ...init, headers });
}

function refreshSessionOnce(refreshToken: string) {
  if (!refreshPromise) {
    refreshPromise = supabase.auth
      .refreshSession({ refresh_token: refreshToken })
      .then(async ({ data, error }) => {
        if (error || !data.session?.access_token) {
          if (!isRetryableAuthError(error)) {
            await supabase.auth.signOut({ scope: "local" });
          }
          return null;
        }

        return data.session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetchWithAccessToken(input, init, session?.access_token);
  if (response.status !== 401 || !session) {
    return response;
  }

  const refreshedSession = await refreshSessionOnce(session.refresh_token);
  if (!refreshedSession?.access_token) {
    return response;
  }

  const retryResponse = await fetchWithAccessToken(
    input,
    init,
    refreshedSession.access_token
  );
  if (retryResponse.status === 401) {
    await supabase.auth.signOut({ scope: "local" });
  }
  return retryResponse;
}
