import { serif } from "./theme.ts";

// Small shared pieces: tabs like ticket stubs, and the quiet states (loading, broken)

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
          className={`relative min-h-10 rounded-[3px] px-3 py-1.5 text-sm transition ${
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

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm italic text-[#f2ead2]/85" style={serif}>
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
