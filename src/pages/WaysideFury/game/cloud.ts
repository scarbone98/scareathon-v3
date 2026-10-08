import { mergeCombatProgress } from "../../../../server/shared/waysideFury/u1Combat.js";
import { SAVE_KEY, parseSave, type SaveData, type ProgressReceipt } from "./save.ts";
import { mergeReceipts, progressScore } from "../../../../server/shared/waysideFury/save.js";
import { cleanFoundItems } from "../../../../server/shared/waysideFury/collectibles.js";
import { mergeItemsSaves } from "../../../../server/shared/waysideFury/u1Items.js";
import { mergeWorldSaves } from "../../../../server/shared/waysideFury/u1World.js";
import { mergeHubSaves } from "../../../../server/shared/waysideFury/u1HubMerge.js";

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
  const additions = (a: string[], b: string[]) => a.filter(id => !b.includes(id)).length;
  return Math.min(100000, (additions(now.areas, before.areas) + additions(now.bosses, before.bosses)) * 1000 +
    additions(now.rooms, before.rooms) * 50 + Math.max(0, now.level - before.level) * 100 +
    additions(now.foundItems ?? [], before.foundItems ?? []) * 20);
}
export function mergeSaves(local: SaveData | null, remote: SaveData | null): SaveData | null {
  local = local ? parseSave(local) : null;
  remote = remote ? parseSave(remote) : null;
  if (!local) return remote;
  if (!remote) return local;
  const difference = progressScore(local) - progressScore(remote);
  const winner = difference > 0 || difference === 0 && local.savedAt > remote.savedAt ? local : remote;
  return mergePersonalProgress({ ...winner, coopRewards: winner.coopRewards ?? [], foundItems: cleanFoundItems([...local.foundItems, ...remote.foundItems]), ambientTaxiWrecked: local.ambientTaxiWrecked || remote.ambientTaxiWrecked, lastReported: mergeReceipts(local.lastReported, remote.lastReported) }, local, remote);
}

function mergePersonalProgress(winner: SaveData, local: SaveData, remote: SaveData): SaveData {
  const recent = local.savedAt > remote.savedAt ? local : remote;
  const alternate = recent === local ? remote : local;
  const hub = mergeHubSaves(winner.u1?.hub, local.u1?.hub, remote.u1?.hub);
  const combat = mergeCombatProgress(local.u1?.combat, remote.u1?.combat);
  const world = mergeWorldSaves(local.u1?.world, remote.u1?.world, winner.u1?.world ?? null);
  const items = mergeItemsSaves(recent.u1?.items, alternate.u1?.items);
  if (JSON.stringify(items) === JSON.stringify(winner.u1?.items) && JSON.stringify(world) === JSON.stringify(winner.u1?.world) && JSON.stringify(combat) === JSON.stringify(winner.u1?.combat) && JSON.stringify(hub) === JSON.stringify(winner.u1?.hub)) return winner;
  // Re-derive hero stats from the selected campaign gear and merged wishes.
  return parseSave({ ...winner, savedAt: Math.max(local.savedAt, remote.savedAt), u1: { ...winner.u1, items, world, combat, hub } })!;
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
    const worldChanged = JSON.stringify(next?.u1?.world) !== JSON.stringify(this.save?.u1?.world);
    const hubChanged = JSON.stringify(next?.u1?.hub) !== JSON.stringify(this.save?.u1?.hub);
    const combatChanged = JSON.stringify(next?.u1?.combat) !== JSON.stringify(this.save?.u1?.combat);
    const difference = remote.save && this.save ? progressScore(remote.save) - progressScore(this.save) : 0;
    const remoteWins = remote.save && (!this.save || difference > 0 || difference === 0 && remote.save.savedAt >= this.save.savedAt);
    const itemsChanged = JSON.stringify(next?.u1?.items) !== JSON.stringify(this.save?.u1?.items);
    const discoveriesChanged = JSON.stringify(next?.foundItems) !== JSON.stringify(this.save?.foundItems)
      || next?.ambientTaxiWrecked !== this.save?.ambientTaxiWrecked;
    this.save = next;
    if (next && this.unconfirmed && receiptScore(next.lastReported, this.confirmed) === 0) this.unconfirmed = null;
    if (next) this.write(next);
    if ((remoteWins || itemsChanged || worldChanged || combatChanged || hubChanged || discoveriesChanged) && this.ready) this.cb.onReplaced(next, "load");
    if (next && this.pending) this.pending = { save: next, credit: this.unconfirmed !== null };
    return !!next && JSON.stringify(next) !== JSON.stringify(remote.save);
  }
  // A checkpoint is durable locally immediately. Account rewards are released
  // only after its revisioned write wins, so concurrent devices cannot both pay.
  persist(save: SaveData, credit = false) {
    if (!this.ready || this.disposed) return false;
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
  private queuedSnapshot(): SaveData | undefined { return this.pending?.save; }
  private async runFlush() {
    if (this.flushing || !this.userId || !this.ready || this.disposed) return;
    this.flushing = true; const epoch = this.epoch;
    let writing: { save: SaveData; credit: boolean } | null = null;
    let personalConflicts = 0;
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
          let merged = remote.save;
          // Recover each personal namespace while the server revision owns the
          // campaign and paid receipts. Include progress queued during the PUT.
          for (const personal of [writing.save, this.save, this.queuedSnapshot()]) {
            if (merged && personal) merged = mergePersonalProgress(merged, personal, merged);
          }
          this.pending = null; this.save = merged; this.revision = remote.revision;
          this.confirmed = mergeReceipts(remote.save?.lastReported); this.unconfirmed = null;
          if (merged) this.write(merged);
          this.cb.onReplaced(merged, "conflict");
          if (merged && JSON.stringify(merged) !== JSON.stringify(remote.save)) {
            this.pending = { save: merged, credit: false }; writing = null;
            if (++personalConflicts >= 3) { this.notify("saving"); this.retry(); return; }
            continue;
          }
          this.notify("saved"); return;
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
