import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { CloudSaveStore, type StoreCallbacks } from "./game/cloud";

// Keep Supabase calls outside its auth-change callback's lock. Invalidate
// synchronously first so an old queued PUT cannot acquire a new user's token.
export function connectSaveStore(callbacks: StoreCallbacks, beforeAccountChange: () => void) {
  const storage = {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
  };
  const store = new CloudSaveStore(storage, async (userId, method, body, signal) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId || signal.aborted) throw new Error("Account changed");
    const response = await fetchWithAuth("/wayside-fury/save", {
      method, signal, keepalive: method === "PUT",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, callbacks);
  let account: string | null | undefined;
  let timer = 0;
  let disposed = false;
  const activate = (id: string | null) => {
    if (disposed || account === id) return;
    beforeAccountChange(); store.invalidate(); account = id;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void store.load(id); }, 0);
  };
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => activate(session?.user.id ?? null));
  void supabase.auth.getSession().then(({ data }) => activate(data.session?.user.id ?? null));
  const online = () => store.retryNow();
  window.addEventListener("online", online);
  return { store, dispose: () => {
    disposed = true; window.clearTimeout(timer); subscription.unsubscribe();
    window.removeEventListener("online", online); void store.closeOnExit();
  } };
}
