// The on-screen keyboard both puzzles use. Keys come back as a letter, "ENTER" or "BACK".
export type KeyState = "correct" | "present" | "absent";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "+ZXCVBNM-"];

export function Keyboard({ onKey, states = {}, enterLabel = "Enter" }: { onKey: (key: string) => void; states?: Record<string, KeyState>; enterLabel?: string }) {
  return (
    <div className="dp-keyboard" role="group" aria-label="Keyboard">
      {ROWS.map((row) => (
        <div key={row} className="dp-krow">
          {[...row].map((k) => {
            if (k === "+") return <button key={k} type="button" className="dp-key dp-key-wide" onClick={() => onKey("ENTER")}>{enterLabel}</button>;
            if (k === "-") return <button key={k} type="button" className="dp-key dp-key-wide" aria-label="Backspace" onClick={() => onKey("BACK")}>⌫</button>;
            return <button key={k} type="button" className={`dp-key ${states[k] ? `dp-${states[k]}` : ""}`} onClick={() => onKey(k)}>{k}</button>;
          })}
        </div>
      ))}
    </div>
  );
}

