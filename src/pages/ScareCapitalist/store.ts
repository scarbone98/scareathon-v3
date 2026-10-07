// Where Scare Capitalist's progress lives: on the player's account when they're signed
// in (scare_capitalist_saves, so it follows them between devices), and in this browser
// too, so guests keep theirs and a dropped connection never loses anything. An idle game
// changes every frame, so the browser copy is written every few seconds and the account
// copy at most every SYNC_MS (and right away on a haunt or when the page is hidden).
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";
import { sanitizeSave } from "../../../server/shared/scareCapitalist/save.js";
import { deserialize, newState, serialize, type State } from "./game/economy";

const LOCAL_KEY = "scare-capitalist-save";
// Whose game the browser copy is: an account id, or nothing for a guest's. Someone
// else's never goes into your account.
const OWNER_KEY = "scare-capitalist-owner";
export const SYNC_MS = 30_000;

type ServerSave = { save: unknown; revision: number | null };

export function readLocal(): State | null {
  try {
    return deserialize(localStorage.getItem(LOCAL_KEY));
  } catch {
    return null;
  }
}

function writeLocal(text: string) {
  try {
    localStorage.setItem(LOCAL_KEY, text);
  } catch {
    // Private mode or full; the account copy still has it.
  }
}

function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(id: string) {
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {
    // Not remembered.
  }
}

function fromServer(raw: unknown): State | null {
  const checked = sanitizeSave(raw);
  return checked.save ? deserialize(JSON.stringify(checked.save)) : null;
}

// Two copies of one player's game: keep whichever has made more money
function further(a: State, b: State) {
  return b.lifetime > a.lifetime ? b : a;
}

export class SaveStore {
  signedIn = false;
  // The account copy's revision; null before the first save there
  private revision: number | null = null;
  private writing: Promise<void> = Promise.resolve();
  private lastSync = 0;
  private queued = false;

  private constructor(private get: () => State, private onReplaced: (s: State) => void) {}

  // Signs in to the account's save. If it's further along than this browser's (or this
  // browser's belongs to someone else) it replaces the running game (onReplaced). A
  // guest's progress comes along into the account the first time they sign in.
  static async open(get: () => State, onReplaced: (s: State) => void) {
    const store = new SaveStore(get, onReplaced);
    const { data } = await supabase.auth.getSession();
    if (!data.session) return store;
    const owner = readOwner();
    const userId = data.session.user.id;
    // This browser's copy is someone else's: it isn't loaded into this account
    const mine = owner === null || owner === userId;
    try {
      const response = await fetchWithAuth("/scare-capitalist/save");
      if (!response.ok) throw new Error(`Save load failed: ${response.status}`);
      const body = (await response.json()) as ServerSave;
      store.revision = body.revision;
      const remote = body.save ? fromServer(body.save) : null;
      store.signedIn = true;
      writeOwner(userId);
      if (!mine || (remote && further(get(), remote) === remote)) {
        const start = remote ?? newState();
        writeLocal(serialize(start));
        onReplaced(start);
      }
      store.sync(true);
    } catch (error) {
      // Offline: play on the browser copy (if it's this player's); the account isn't
      // written until it's been read, so this can't overwrite newer progress there.
      console.error(error);
    }
    return store;
  }

  // Every autosave: the browser copy now, the account copy if it's been a while
  // (or `now`, for a haunt or the page going away)
  save(now = false) {
    writeLocal(serialize(this.get()));
    this.sync(now);
  }

  private sync(now: boolean) {
    if (!this.signedIn) return;
    if (!now && Date.now() - this.lastSync < SYNC_MS) return;
    this.lastSync = Date.now();
    // One write at a time; a sync asked for mid-write sends the newest state after it
    if (this.queued) return;
    this.queued = true;
    this.writing = this.writing.then(() => {
      this.queued = false;
      return this.flush();
    });
  }

  private async flush() {
    const state = this.get();
    try {
      const response = await fetchWithAuth("/scare-capitalist/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save: JSON.parse(serialize(state)), revision: this.revision }),
        keepalive: true,
      });
      if (response.status === 409) {
        // Played on another device or tab since: whichever is further along wins
        const body = (await response.json()) as ServerSave;
        this.revision = body.revision;
        const remote = body.save ? fromServer(body.save) : null;
        if (remote && further(this.get(), remote) === remote) {
          writeLocal(serialize(remote));
          this.onReplaced(remote);
        } else {
          this.lastSync = 0;
          this.sync(true);
        }
        return;
      }
      if (!response.ok) throw new Error(`Save failed: ${response.status} ${await response.text()}`);
      this.revision = ((await response.json()) as { revision: number }).revision;
    } catch (error) {
      console.error(error);
    }
  }
}
