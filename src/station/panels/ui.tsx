import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { serif } from "./theme.ts";

// Shared pieces for the station's panels: tabs like luggage tags, notices on paper,
// and the quiet states (loading, sign in first, something broke).


export function PanelHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-200/50">{eyebrow}</p>
      <h2 className="mt-1 text-2xl text-amber-100" style={serif}>
        {title}
      </h2>
      {children && <div className="mt-2 text-sm leading-relaxed text-stone-300/80">{children}</div>}
    </header>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-1.5 border-b border-amber-200/10 pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={`relative rounded-sm px-3 py-1.5 text-sm transition ${
            tab.id === value
              ? "bg-amber-200/90 text-stone-900 shadow-[2px_2px_0_rgba(0,0,0,0.5)]"
              : "text-amber-100/70 ring-1 ring-amber-200/15 hover:bg-amber-100/5 hover:text-amber-50"
          }`}
          style={serif}
        >
          {tab.label}
          {tab.badge ? (
            <span className="ml-1.5 rounded-full bg-red-700 px-1.5 text-[10px] font-bold text-white">{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// A pinned notice: cream paper, dark ink
export function Paper({ children, tilt = 0, className = "" }: { children: ReactNode; tilt?: number; className?: string }) {
  return (
    <div
      className={`relative rounded-[2px] bg-[#efe3c8] p-4 text-stone-900 shadow-[3px_4px_0_rgba(0,0,0,0.45)] ${className}`}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-red-800 shadow" aria-hidden />
      {children}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm italic text-amber-100/50" style={serif}>
      {label}…
    </p>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
      {message}
    </p>
  );
}

// Shown where the classic site needs an account: the kiosk is where you sign in
export function SignInFirst({ what, onGoToKiosk }: { what: string; onGoToKiosk: () => void }) {
  return (
    <div className="rounded border border-dashed border-amber-200/25 px-4 py-5 text-center">
      <p className="text-sm text-stone-300" style={serif}>
        {what} are for ticket holders.
      </p>
      <button
        type="button"
        onClick={onGoToKiosk}
        className="mt-3 rounded-full bg-amber-300 px-4 py-1.5 text-sm font-semibold text-stone-900 hover:bg-amber-200"
      >
        Sign in at the ticket kiosk
      </button>
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-200">
      {children}
    </Link>
  );
}
