import type { ReactNode } from "react";
import { plate, plateButton, serif, stubButton } from "./theme.ts";

// Shared pieces for the station's panels: an enamel heading plate, tabs like ticket
// stubs, notices on paper, and the quiet states (loading, sign in first, broken).

export function PanelHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <div className={`${plate} rounded-[3px] px-4 py-3`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#f2ead2]/60">{eyebrow}</p>
        <h2 className="mt-0.5 text-2xl leading-tight" style={serif}>
          {title}
        </h2>
      </div>
      {children && <div className="mt-3 text-sm leading-relaxed text-stone-300/85">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3 border-b border-[#f2ead2]/15 pb-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f2ead2]/70">{children}</h3>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={`relative rounded-[3px] px-3 py-1.5 text-sm transition ${
            tab.id === value
              ? "bg-[#efe3c8] text-[#1d2a3a] shadow-[2px_2px_0_rgba(0,0,0,0.5)]"
              : "text-[#f2ead2]/75 ring-1 ring-[#f2ead2]/25 hover:bg-[#f2ead2]/5 hover:text-[#f2ead2]"
          }`}
          style={serif}
        >
          {tab.label}
          {tab.badge ? <span className="ml-1.5 rounded-full bg-red-700 px-1.5 text-[10px] font-bold text-white">{tab.badge}</span> : null}
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
    <p role="status" className="py-8 text-center text-sm italic text-[#f2ead2]/50" style={serif}>
      {label}…
    </p>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-[3px] border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
      {message}
    </p>
  );
}

// Shown where the site needs an account: the kiosk is where you sign in
export function SignInFirst({ what, onGoToKiosk }: { what: string; onGoToKiosk: () => void }) {
  return (
    <div className="rounded-[3px] border border-dashed border-[#f2ead2]/25 px-4 py-5 text-center">
      <p className="text-sm text-stone-300" style={serif}>
        {what} are for ticket holders.
      </p>
      <button type="button" onClick={onGoToKiosk} className={`${stubButton} mt-3`}>
        Sign in at the ticket kiosk
      </button>
    </div>
  );
}

export function PlainButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={plateButton}>
      {children}
    </button>
  );
}
