import { isRetryableAuthError } from "./authErrors";
import { supabase } from "./supabaseClient";

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

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data.session?.access_token) {
    if (!isRetryableAuthError(error)) {
      await supabase.auth.signOut();
    }
    return response;
  }

  const retryResponse = await fetchWithAccessToken(
    input,
    init,
    data.session.access_token
  );
  if (retryResponse.status === 401) {
    await supabase.auth.signOut();
  }
  return retryResponse;
}
