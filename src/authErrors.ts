export function isRetryableAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { name?: string; status?: number };
  return (
    authError.name === "AuthRetryableFetchError" ||
    authError.status === 0 ||
    (typeof authError.status === "number" && authError.status >= 500)
  );
}

export function shouldClearAuthSession(error: unknown) {
  if (!error || typeof error !== "object") return true;
  if (isRetryableAuthError(error)) return false;

  const authError = error as { name?: string; status?: number };
  return (
    authError.name === "AuthApiError" ||
    authError.name === "AuthSessionMissingError" ||
    authError.status === 400 ||
    authError.status === 401 ||
    authError.status === 403
  );
}
