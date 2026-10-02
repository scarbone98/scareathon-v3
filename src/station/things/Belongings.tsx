// The belongings' pieces share the avatar hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import "../../styles/profile.css";
import { Suspense, lazy, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { AvatarView } from "../../components/avatar/AvatarView";
import { lookFromAvatar } from "../../components/avatar/look";
import type { AvatarLook, AvatarResponse } from "../../components/avatar/types";
import { useSummary } from "../data.ts";
import { useInboxUnreadCount } from "../../pages/Inbox/useInboxUnreadCount";
import type { GoTo } from "../stops.ts";
import { Loading, Problem } from "../style/ui.tsx";
import { plateButton, serif, stubButton } from "../style/theme.ts";

// A ticket holder's own things, each kept where it belongs in the station: the item shop
// at the ticket counter, clothes in your left-luggage locker, letters in your pigeonhole,
// and your name in the station register beside it. The shop, wardrobe and inbox are the
// classic site's own components, so they behave exactly the same.

const AvatarShop = lazy(() => import("../../components/avatar/AvatarShop").then((m) => ({ default: m.AvatarShop })));
const AvatarEditor = lazy(() => import("../../components/avatar/AvatarEditor").then((m) => ({ default: m.AvatarEditor })));
const InboxContent = lazy(() => import("../../pages/Inbox/page").then((m) => ({ default: m.InboxContent })));

const darkField =
  "w-full rounded-[3px] border border-[#f2ead2]/25 bg-[#0b1017]/70 px-3 py-2 text-sm text-[#f2ead2] focus:border-[#f2ead2]/70 focus:outline-none";

export function useAvatarLook(enabled = true) {
  const { data: avatar } = useQuery<AvatarResponse>({
    enabled,
    queryKey: ["avatar"],
    queryFn: () =>
      fetchWithAuth("/user/avatar").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load avatar");
        return data;
      }),
  });
  return avatar ? lookFromAvatar(avatar.data) : null;
}

// Where you need a ticket: a word, and the way to the kiosk
function TicketHoldersOnly({ what, goTo, dark = true }: { what: string; goTo: GoTo; dark?: boolean }) {
  return (
    <div className={`py-4 text-center ${dark ? "text-stone-300" : "text-[#2a1d14]"}`}>
      <p className="text-lg" style={serif}>
        {what} are for passengers.
      </p>
      <button type="button" onClick={() => goTo("tickets")} className={`${stubButton} mt-3`}>
        Sign in at the counter
      </button>
    </div>
  );
}

// You, as you look now (or as you'd look in what you're trying on), and your coins
// Your name, and (where `renamable`) the way to change it, right there
function YourName({ renamable }: { renamable: boolean }) {
  const { data: summary } = useSummary();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const invalid = name.length > 0 && !/^[a-zA-Z0-9_]{1,32}$/.test(name);
  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      fetchWithAuth("/user/updateUsername", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername: name }),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update username");
        return data;
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["user"], data);
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      setEditing(false);
    },
  });
  if (editing)
    return (
      <form
        className="my-1 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name && !invalid) mutate();
        }}
      >
        <input className={darkField} autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid} aria-label="Your name" />
        {invalid && <Problem message="1–32 letters, numbers and underscores only." />}
        {error && <Problem message={error.message} />}
        <div className="flex gap-2">
          <button type="submit" className={stubButton} disabled={!name || invalid || isPending}>
            {isPending ? "Saving…" : "Save name"}
          </button>
          <button type="button" className={plateButton} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <p className="truncate text-2xl text-[#f2ead2]" style={serif}>
        {summary?.username ?? "…"}
      </p>
      {renamable && (
        <button type="button" className="shrink-0 text-[13px] text-[#f2ead2]/70 underline underline-offset-4 hover:text-[#f2ead2]" onClick={() => { setName(summary?.username || ""); setEditing(true); }}>
          Rename
        </button>
      )}
    </div>
  );
}

function Mirror({ look, eyebrow, note, large = false, roomy = false, renamable = false }: { look: AvatarLook | null; eyebrow: string; note?: ReactNode; large?: boolean; roomy?: boolean; renamable?: boolean }) {
  const { data: summary } = useSummary();
  if (large)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex h-[30rem] items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20">
          <AvatarView look={look} height={440} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">{eyebrow}</p>
          <YourName renamable={renamable} />
          <p className="text-sm text-amber-300">
            {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} tickets` : "…"}
            {note}
          </p>
        </div>
      </div>
    );
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className={`flex ${roomy ? "h-36 w-28" : "h-24 w-20"} shrink-0 items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20`}>
        <AvatarView look={look} height={roomy ? 144 : 96} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">{eyebrow}</p>
        <YourName renamable={renamable} />
        <p className="text-sm text-amber-300">
          {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} tickets` : "…"}
          {note}
        </p>
      </div>
    </div>
  );
}

// The classic components expect the profile page's styles around them
function Classic({ children }: { children: ReactNode }) {
  return (
    <div className="profile-world" style={{ paddingBottom: 0 }}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </div>
  );
}

export function Shop({ signedIn, goTo, focus }: { signedIn: boolean; goTo: GoTo; focus?: string }) {
  const [preview, setPreview] = useState<AvatarLook | null>(null);
  const unread = useInboxUnreadCount();
  const saved = useAvatarLook(signedIn);
  if (!signedIn) return <TicketHoldersOnly what="The item shop's wares" goTo={goTo} />;
  const look = preview || saved;
  const note = preview ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null;
  // Full screen, as the wardrobe: you stay in view (beside the wares, or above them on a
  // phone) while only the wares scroll
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row md:gap-8">
      <div className="shrink-0 md:w-80">
        <div className="md:hidden">
          <Mirror look={look} eyebrow="Item shop" note={note} roomy />
        </div>
        <div className="hidden md:block">
          <Mirror look={look} eyebrow="Item shop" note={note} large />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
      <Classic>
        <AvatarShop onPreviewLookChange={setPreview} focusName={focus} />
      </Classic>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-[#f2ead2]/15 pt-4">
        <button type="button" className={plateButton} onClick={() => goTo("lockers")}>
          Your locker: dress up
        </button>
        <button type="button" className={plateButton} onClick={() => goTo("mail", "letters")}>
          Inbox{unread ? ` (${unread})` : ""}
        </button>
        <button type="button" className={plateButton} onClick={() => goTo("mail", "register")}>
          Settings
        </button>
      </div>
      </div>
    </div>
  );
}

export function Wardrobe({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [preview, setPreview] = useState<AvatarLook | null>(null);
  const saved = useAvatarLook(signedIn);
  if (!signedIn) return <TicketHoldersOnly what="Lockers" goTo={goTo} />;
  const look = preview || saved;
  const note = preview ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null;
  // Full screen: you stay in view (beside the clothes, or above them on a phone) while
  // only the clothes scroll, so whatever you try on shows at once
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row md:gap-8">
      <div className="shrink-0 md:w-80">
        <div className="md:hidden">
          <Mirror look={look} eyebrow="Your locker" note={note} roomy renamable />
        </div>
        <div className="hidden md:block">
          <Mirror look={look} eyebrow="Your locker" note={note} large renamable />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <Classic>
          <AvatarEditor onPreviewLookChange={setPreview} />
        </Classic>
      </div>
    </div>
  );
}

export function Letters({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  if (!signedIn) return <TicketHoldersOnly what="Inboxes" goTo={goTo} />;
  return (
    <>
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Inbox</p>
      <Classic>
        <InboxContent />
      </Classic>
    </>
  );
}

// Settings, kept in the station register by the pigeonholes: your account (email and
// password) and signing out. (Your name is changed at your locker.)
export function Register({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "password" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: current } = useQuery({ queryKey: ["auth-email"], queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? null, enabled: signedIn });

  if (!signedIn) return <TicketHoldersOnly what="Settings" goTo={goTo} />;
  const change = async (what: "email" | "password") => {
    setBusy(what);
    setMessage(null);
    const { error } = await supabase.auth.updateUser(what === "email" ? { email } : { password });
    setBusy(null);
    if (error) return setMessage({ ok: false, text: error.message });
    if (what === "email") {
      setEmail("");
      setMessage({ ok: true, text: "Check both inboxes: confirm the change from the links we've sent." });
    } else {
      setPassword("");
      setMessage({ ok: true, text: "Password changed." });
    }
  };
  return (
    <div className="space-y-6 text-sm text-stone-300">
      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Settings</p>
        <h3 className="mt-1 text-xl text-[#f2ead2]" style={serif}>
          Your account
        </h3>
        <p className="mt-1 text-stone-400">Signed in as {current ?? "…"}. (Change your name at your locker.)</p>
        <form className="mt-3 flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); if (email) void change("email"); }}>
          <input className={darkField} type="email" placeholder="New email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="New email" autoComplete="email" />
          <button type="submit" className={`${plateButton} shrink-0`} disabled={!email || busy !== null}>
            {busy === "email" ? "…" : "Change"}
          </button>
        </form>
        <form className="mt-2 flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); if (password.length >= 6) void change("password"); }}>
          <input className={darkField} type="password" placeholder="New password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" autoComplete="new-password" />
          <button type="submit" className={`${plateButton} shrink-0`} disabled={password.length < 6 || busy !== null}>
            {busy === "password" ? "…" : "Change"}
          </button>
        </form>
        {message && <p className={`mt-2 ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p>}
      </section>
      <section>
        <h3 className="text-base text-[#f2ead2]" style={serif}>
          Heading out?
        </h3>
        <p className="mt-1 text-stone-400">Your locker and inbox will be here when you get back.</p>
        <button type="button" className={`${plateButton} mt-3`} onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}
