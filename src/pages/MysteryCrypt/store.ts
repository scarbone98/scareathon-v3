// Where Mystery Crypt's progress lives: on the player's account when they're
// signed in (so it follows them between devices), and in this browser too, so
// guests keep theirs and a flaky connection never loses a stage.
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";
import { newSave, sanitizeSave, type Save } from "./game/save.ts";

const LOCAL_KEY = "mystery-crypt-save";

function readLocal(): Save | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return sanitizeSave(JSON.parse(raw)).save ?? null;
  } catch {
    return null;
  }
}

function writeLocal(save: Save) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(save));
  } catch {
    // Private mode or full; the account copy still has it.
  }
}

type ServerSave = { save: unknown; revision: number | null };

export class SaveStore {
  save: Save;
  signedIn = false;
  // The account copy's revision; null before the first save there.
  private revision: number | null = null;
  private writing: Promise<void> = Promise.resolve();
  private pending: Save | null = null;

  private constructor(save: Save, private onReplaced: (save: Save) => void) {
    this.save = save;
  }

  // Loads the account's save, or this browser's for guests. A signed-in
  // player with no account save yet brings this browser's progress along.
  static async open(onReplaced: (save: Save) => void) {
    const local = readLocal();
    const store = new SaveStore(local ?? newSave(), onReplaced);
    const { data } = await supabase.auth.getSession();
    if (!data.session) return store;
    store.signedIn = true;
    try {
      const response = await fetchWithAuth("/mystery-crypt/save");
      if (!response.ok) throw new Error(`Save load failed: ${response.status}`);
      const body = (await response.json()) as ServerSave;
      const remote = body.save ? sanitizeSave(body.save).save : null;
      if (remote) {
        store.save = remote;
        store.revision = body.revision;
        writeLocal(remote);
      } else {
        store.persist(store.save);
      }
    } catch (error) {
      // Offline: play on the local copy; the next save tries the account again.
      console.error(error);
    }
    return store;
  }

  // Keeps `save` here now and on the account soon after. Writes go one at a
  // time, and only the newest waiting one is sent.
  persist(save: Save) {
    this.save = save;
    writeLocal(save);
    if (!this.signedIn) return;
    this.pending = save;
    this.writing = this.writing.then(() => this.flush());
  }

  private async flush() {
    const save = this.pending;
    if (!save) return;
    this.pending = null;
    try {
      const response = await fetchWithAuth("/mystery-crypt/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save, revision: this.revision }),
      });
      if (response.status === 409) {
        // Played on another device or tab since: theirs wins.
        const body = (await response.json()) as ServerSave;
        const remote = body.save ? sanitizeSave(body.save).save : null;
        this.revision = body.revision;
        if (remote && !this.pending) {
          this.save = remote;
          writeLocal(remote);
          this.onReplaced(remote);
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
