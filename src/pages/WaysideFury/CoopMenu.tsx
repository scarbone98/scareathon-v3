import { useState } from "react";
import type { CoopRoom } from "./game/coop";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function CoopMenu({ signedIn, room, busy, initialCode, onHost, onJoin, onLeave, onBack }: {
  signedIn: boolean; room: CoopRoom | null; busy: boolean; initialCode: string;
  onHost(): void; onJoin(code: string): void; onLeave(): void; onBack(): void;
}) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [padEntry, setPadEntry] = useState(false);
  const adjust = (at: number, direction: number) => setCode(current => {
    const letters = current.padEnd(4, "A").split("");
    letters[at] = ALPHABET[(Math.max(0, ALPHABET.indexOf(letters[at])) + direction + ALPHABET.length) % ALPHABET.length];
    return letters.join("");
  });
  return <section className="wf-overlay wf-coop-menu" aria-label="Co-op">
    <p className="wf-eyebrow">DROP IN · FOUR PLAYERS</p><h2>Co-op</h2>
    {!signedIn ? <p>Sign in to play co-op</p> : room ? <>
      <p>{room.seat === room.hostSeat ? "Hosting" : "Party"} · Room code</p>
      <strong className="wf-room-code" data-testid="coop-code">{room.code}</strong>
      <button onClick={() => { void navigator.clipboard?.writeText(room.code).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Copied" : "Copy"}</button>
      <ol className="wf-seat-list">{[0, 1, 2, 3].map(seat => {
        const player = room.players.find(p => p.seat === seat);
        return <li key={seat}>{player ? `${player.name}${seat === room.hostSeat ? " · Host" : ""}${player.connected ? "" : " · Reconnecting…"}` : "Open seat"}</li>;
      })}</ol><button className="wf-secondary" onClick={onLeave}>Leave party</button>
    </> : <>
      <button disabled={busy} onClick={onHost}>Host</button>
      <label htmlFor="wf-room-entry">Join with a room code</label>
      <input id="wf-room-entry" aria-label="Room code" autoComplete="off" autoCapitalize="characters" maxLength={4} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} onKeyDown={event => { if (event.key === "Enter" && code.length === 4 && !busy) onJoin(code); }} />
      <button className="wf-secondary" aria-expanded={padEntry} onClick={() => { if (!code) setCode("AAAA"); setPadEntry(!padEntry); }}>Controller code entry</button>
      {padEntry && <div className="wf-code-picker">{[0, 1, 2, 3].map(at => <div key={at}><button aria-label={`Increase code letter ${at + 1}`} onClick={() => adjust(at, 1)}>▲</button><strong>{code[at] ?? "A"}</strong><button aria-label={`Decrease code letter ${at + 1}`} onClick={() => adjust(at, -1)}>▼</button></div>)}</div>}
      <button disabled={busy || code.length !== 4} onClick={() => onJoin(code)}>Join</button>
      <p className="wf-small">{busy ? "Connecting…" : "The host leads the adventure. Every player keeps their own character and rewards."}</p>
    </>}
    <button className="wf-secondary" onClick={onBack}>{room ? "Return to adventure" : "Back"}</button>
  </section>;
}
