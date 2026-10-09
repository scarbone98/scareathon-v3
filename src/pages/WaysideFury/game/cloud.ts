import { mergeItemsSaves, sanitizeItemsNamespace } from "../../../../server/shared/waysideFury/u1Items.js";
import { SAVE_KEY, makeNewGameSave, parseSave, ticketDelta, type SaveData, type ProgressReceipt } from "./save.ts";
import { mergeReceipts, progressScore } from "../../../../server/shared/waysideFury/save.js";
import { cleanFoundItems } from "../../../../server/shared/waysideFury/collectibles.js";

export type SaveStatus = "loading" | "saving" | "saved" | "local" | "offline" | "unavailable";
export interface SaveTransport {
  (userId: string, method: "GET" | "PUT", body: { save: SaveData; revision: number | null } | null,
    signal: AbortSignal, keepalive: boolean): Promise<{ status: number; body: unknown }>;
}
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface StoreCallbacks {
  onChange: (value: { save: SaveData | null; status: SaveStatus; ready: boolean }) => void;
  onReplaced: (save: SaveData | null, reason: "load" | "conflict") => void;
  onCredit: (score: number) => void;
}
const OWNER_KEY = `${SAVE_KEY}-owner`;
const GUEST_KEY = `${SAVE_KEY}:guest`;
const accountKey = (id: string) => `${SAVE_KEY}:account:${id}`;
export function receiptScore(now: ProgressReceipt, before: ProgressReceipt) {
  return ticketDelta(now, before);
}
export function mergeSaves(local: SaveData | null, remote: SaveData | null): SaveData | null {
  if (!local) return remote;
  if (!remote) return local;
  const resetDifference = (local.resetAt ?? 0) - (remote.resetAt ?? 0);
  const difference = resetDifference || progressScore(local) - progressScore(remote);
  const winner = difference > 0 || difference === 0 && local.savedAt > remote.savedAt ? local : remote;
  const recent = local.savedAt > remote.savedAt ? local : remote;
  const alternate = recent === local ? remote : local;
  const u1 = sanitizeItemsNamespace(winner.u1);
  u1.items = resetDifference ? u1.items : mergeItemsSaves(recent.u1?.items, alternate.u1?.items);
  return parseSave({ ...winner, u1, coopRewards: winner.coopRewards ?? [],
    foundItems: cleanFoundItems([...local.foundItems, ...remote.foundItems]),
    ambientTaxiWrecked: resetDifference ? winner.ambientTaxiWrecked : local.ambientTaxiWrecked || remote.ambientTaxiWrecked,
    lastReported: mergeReceipts(local.lastReported, remote.lastReported) });
}

// The transport and storage are replaceable so races and disconnected devices
// can be exercised without a browser, JWT service, or production database.
export class CloudSaveStore {
  save: SaveData | null = null;
  ready = false;
  userId: string | null = null;
  private revision: number | null = null;
  private revisionKnown = false;
  private epoch = 0;
  private disposed = false;
  private controllers = new Set<AbortController>();
  private pending: { save: SaveData; credit: boolean } | null = null;
  private flushing = false;
  private resetting = false;
  private running: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmed = mergeReceipts();
  private unconfirmed: ProgressReceipt | null = null;
  private locallyDurable = true;
  private keepalive = false;

  private storage: Storage;
  private request: SaveTransport;
  private cb: StoreCallbacks;
  constructor(storage: Storage, request: SaveTransport, cb: StoreCallbacks) {
    this.storage = storage; this.request = request; this.cb = cb;
  }
  private notify(status: SaveStatus) { if (!this.disposed) this.cb.onChange({ save: this.save, ready: this.ready, status }); }
  private read(key: string, account = false): SaveData | null {
    try {
      const raw = this.storage.getItem(key);
      if (!raw || raw.length > 131072) return null;
      const value = JSON.parse(raw);
      if (account && value && typeof value === "object" && "save" in value) {
        const save = parseSave(value.save);
        if (save && value.creditBase) this.unconfirmed = mergeReceipts(value.creditBase);
        return save;
      }
      return parseSave(value);
    } catch { this.locallyDurable = false; return null; }
  }
  private owner() { try { return this.storage.getItem(OWNER_KEY); } catch { return null; } }
  private local(id: string | null) {
    const cached = this.read(id ? accountKey(id) : GUEST_KEY, !!id);
    const owner = this.owner();
    const legacy = !owner || owner === id ? this.read(SAVE_KEY) : null;
    if (id && !owner && legacy) {
      // Preserve the guest copy before the account mirror replaces the old key.
      try { this.storage.setItem(GUEST_KEY, JSON.stringify(legacy)); } catch { this.locallyDurable = false; }
    }
    return mergeSaves(cached, legacy);
  }
  private write(save: SaveData) {
    try {
      const value = JSON.stringify(save);
      // The snapshot and its unacknowledged reward base are one atomic write.
      this.storage.setItem(this.userId ? accountKey(this.userId) : GUEST_KEY,
        this.userId ? JSON.stringify({ save, creditBase: this.unconfirmed }) : value);
      this.locallyDurable = true;
      try {
        this.storage.setItem(OWNER_KEY, this.userId ?? "");
        this.storage.setItem(SAVE_KEY, value);
      } catch { /* The scoped copy is still durable. */ }
    } catch { this.locallyDurable = false; }
  }
  invalidate() {
    this.epoch++; this.ready = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null; this.pending = null; this.flushing = false; this.running = null;
    this.notify("loading");
  }
  async load(userId: string | null) {
    if (this.disposed) return;
    this.invalidate(); this.userId = userId; this.revision = null; this.revisionKnown = false;
    this.unconfirmed = null; this.locallyDurable = true;
    this.save = this.local(userId); this.confirmed = mergeReceipts(this.unconfirmed ?? this.save?.lastReported);
    const epoch = this.epoch;
    if (!userId) {
      this.ready = true;
      this.cb.onReplaced(this.save, "load");
      this.notify(this.locallyDurable ? "local" : "unavailable"); return;
    }
    this.notify("loading");
    try {
      const shouldUpload = await this.reconcile(epoch);
      if (epoch !== this.epoch) return;
      this.ready = true;
      this.cb.onReplaced(this.save, "load");
      if (this.save && shouldUpload) this.pending = { save: this.save, credit: this.unconfirmed !== null };
      this.notify(this.pending ? "saving" : "saved");
      void this.flush();
    } catch {
      if (epoch !== this.epoch) return;
      this.ready = true; this.cb.onReplaced(this.save, "load");
      this.notify(this.locallyDurable ? "offline" : "unavailable"); this.retry();
    }
  }
  private async send(method: "GET" | "PUT", body: { save: SaveData; revision: number | null } | null, epoch: number) {
    const controller = new AbortController(); this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      if (!this.userId || epoch !== this.epoch) throw new Error("Account changed");
      return await this.request(this.userId, method, body, controller.signal, this.keepalive);
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  private decode(body: unknown) {
    if (!body || typeof body !== "object") throw new Error("Invalid save response");
    const raw = body as { save?: unknown; revision?: unknown };
    const save = raw.save == null ? null : parseSave(raw.save);
    if (raw.save != null && !save || raw.revision !== null && !(Number.isInteger(raw.revision) && (raw.revision as number) >= 1) || save && raw.revision === null) throw new Error("Invalid save response");
    return { save, revision: raw.revision as number | null };
  }
  private async reconcile(epoch: number) {
    const response = await this.send("GET", null, epoch);
    if (epoch !== this.epoch) return false;
    if (response.status !== 200) throw new Error("Could not load account save");
    const remote = this.decode(response.body);
    this.revision = remote.revision; this.revisionKnown = true;
    this.confirmed = mergeReceipts(this.confirmed, remote.save?.lastReported);
    const next = mergeSaves(this.save, remote.save);
    const difference = remote.save && this.save ? ((remote.save.resetAt ?? 0) - (this.save.resetAt ?? 0) || progressScore(remote.save) - progressScore(this.save)) : 0;
    const remoteWins = remote.save && (!this.save || difference > 0 || difference === 0 && remote.save.savedAt >= this.save.savedAt);
    this.save = next;
    if (next && this.unconfirmed && receiptScore(next.lastReported, this.confirmed) === 0) this.unconfirmed = null;
    if (next) this.write(next);
    if (remoteWins && this.ready) this.cb.onReplaced(next, "load");
    if (next && this.pending) this.pending = { save: next, credit: this.unconfirmed !== null };
    return !!next && JSON.stringify(next) !== JSON.stringify(remote.save);
  }
  // Confirm the account replacement before touching local story progress.
  // Existing writes finish first; a concurrent writer or account switch cancels it.
  async newGame(): Promise<SaveData> {
    if (!this.ready || this.disposed || this.resetting) throw new Error("Save is not ready");
    const epoch = this.epoch;
    this.resetting = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    try {
      if (this.running) await this.running;
      if (epoch !== this.epoch) throw new Error("Account changed");
      let previous = this.save;
      if (this.userId) {
        const response = await this.send("GET", null, epoch);
        if (response.status !== 200) throw new Error("Could not load account save");
        const remote = this.decode(response.body);
        if (epoch !== this.epoch) throw new Error("Account changed");
        previous = mergeSaves(previous, remote.save);
        const fresh = makeNewGameSave(previous);
        const written = await this.send("PUT", { save: fresh, revision: remote.revision }, epoch);
        if (epoch !== this.epoch) throw new Error("Account changed");
        const revision = (written.body as { revision?: number })?.revision;
        if (written.status !== 200 || !Number.isInteger(revision) || revision! < 1) throw new Error("Could not reset account save");
        this.revision = revision!; this.revisionKnown = true;
        this.save = fresh;
      } else {
        const fresh = makeNewGameSave(previous);
        this.write(fresh);
        if (!this.locallyDurable) throw new Error("Device storage unavailable");
        this.save = fresh;
      }
      this.pending = null; this.unconfirmed = null;
      this.confirmed = mergeReceipts(this.save.lastReported);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null; this.write(this.save);
      this.notify(this.userId ? "saved" : "local");
      return this.save;
    } finally { this.resetting = false; if (this.pending) this.retry(); }
  }
  // A checkpoint is durable locally immediately. Account rewards are released
  // only after its revisioned write wins, so concurrent devices cannot both pay.
  persist(save: SaveData, credit = false) {
    if (!this.ready || this.disposed || this.resetting) return false;
    const previous = this.confirmed;
    if (credit && !this.unconfirmed) this.unconfirmed = mergeReceipts(this.confirmed);
    this.save = save; this.write(save);
    if (!this.userId) {
      this.notify(this.locallyDurable ? "local" : "unavailable");
      if (this.locallyDurable) {
        this.confirmed = mergeReceipts(this.confirmed, save.lastReported);
        const score = receiptScore(save.lastReported, previous);
        const owed = credit || this.unconfirmed !== null; this.unconfirmed = null;
        if (owed && score > 0) this.cb.onCredit(score);
      }
      return this.locallyDurable;
    }
    this.pending = { save, credit: this.unconfirmed !== null || credit || (this.pending?.credit ?? false) };
    this.notify("saving"); void this.flush(); return true;
  }
  flushOnExit() { this.keepalive = true; void this.flush(); }
  retryNow() { if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = null; void this.flush(); }
  private retry() {
    if (this.disposed || !this.userId || this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush(); }, 10000);
  }
  private flush(): Promise<void> {
    if (this.running) return this.running;
    const running = this.runFlush().finally(() => { if (this.running === running) this.running = null; });
    this.running = running;
    return running;
  }
  private async runFlush() {
    if (this.resetting || this.flushing || !this.userId || !this.ready || this.disposed) return;
    this.flushing = true; const epoch = this.epoch;
    let writing: { save: SaveData; credit: boolean } | null = null;
    try {
      if (!this.revisionKnown) {
        await this.reconcile(epoch);
        if (epoch !== this.epoch) return;
        if (!this.pending && this.save) this.pending = { save: this.save, credit: this.unconfirmed !== null };
      }
      while (this.pending && epoch === this.epoch) {
        writing = this.pending; this.pending = null;
        const response = await this.send("PUT", { save: writing.save, revision: this.revision }, epoch);
        if (epoch !== this.epoch) return;
        if (response.status === 409) {
          const remote = this.decode(response.body);
          // Discard all queued snapshots from before the conflict, including
          // a checkpoint queued while this request was in flight.
          this.pending = null; this.save = remote.save; this.revision = remote.revision;
          this.confirmed = mergeReceipts(remote.save?.lastReported); this.unconfirmed = null;
          if (remote.save) this.write(remote.save);
          this.cb.onReplaced(remote.save, "conflict"); this.notify("saved"); return;
        }
        const revision = (response.body as { revision?: number })?.revision;
        if (response.status !== 200 || !Number.isInteger(revision) || revision! < 1) throw new Error("Could not save progress");
        this.revision = revision!;
        const score = receiptScore(writing.save.lastReported, this.confirmed);
        this.confirmed = mergeReceipts(this.confirmed, writing.save.lastReported);
        this.unconfirmed = this.save && receiptScore(this.save.lastReported, this.confirmed) > 0 && this.unconfirmed
          ? mergeReceipts(this.confirmed) : null;
        if (this.save) this.write(this.save);
        if (writing.credit && score > 0) this.cb.onCredit(score);
        writing = null;
      }
      if (epoch === this.epoch) this.notify("saved");
    } catch {
      if (epoch !== this.epoch) return;
      if (writing) this.pending = { save: this.pending?.save ?? writing.save, credit: writing.credit || (this.pending?.credit ?? false) };
      this.notify(this.locallyDurable ? "offline" : "unavailable"); this.retry();
    } finally {
      if (epoch === this.epoch) { this.flushing = false; this.keepalive = false; }
    }
  }
  async closeOnExit() {
    this.keepalive = true;
    if (this.running) await this.running;
    await this.flush();
    this.dispose();
  }
  dispose() { this.disposed = true; this.invalidate(); }
}
