import MarketListings from "./MarketListings";
import { useFeatures } from "../features";
import { BlockedRiders } from "./ContentControls";
// The belongings' pieces share the avatar hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import "../../styles/profile.css";
import { Suspense, lazy, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaPencilAlt, FaSearch } from "react-icons/fa";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { AvatarView } from "../../components/avatar/AvatarView";
import { lookFromAvatar } from "../../components/avatar/look";
import type { AvatarLook, AvatarResponse } from "../../components/avatar/types";
import { formatShortDate, useSummary } from "../data.ts";
import { useInboxUnreadCount } from "../../pages/Inbox/useInboxUnreadCount";
import type { GoTo } from "../stops.ts";
import { Loading, Problem } from "../style/ui.tsx";
import { plateButton, serif, stubButton } from "../style/theme.ts";
import { BannerShelf, useBackdrop, useBannerShopItems } from "./Banners.tsx";
import { bannerStyle } from "../banners.ts";
import NewsDot from "../../components/NewsDot";
import { noteLooked, shopNewSince } from "../seen.ts";
import { NO_FILTERS, ShopCategoryTabs, ShopFilterMenus, useTabSwipe, type ShopFilters } from "../../components/avatar/shopFilters";
import TicketIcon from "../../components/TicketIcon";
import { SheetActions } from "../Sheet.tsx";
import ShopKeeper, { type TriedOn } from "./ShopKeeper.tsx";
import { useSongShopItems } from "./Songs.tsx";
import { useCartShopItems } from "./Carts.tsx";
import LegalPapers from "./LegalPapers.tsx";
import { radio } from "../radio.ts";

// A ticket holder's own things, each kept where it belongs in the station: the item shop
// at the ticket counter, clothes in your left-luggage locker, letters in your pigeonhole,
// and your name in the station register beside it. The shop, wardrobe and inbox are the
// classic site's own components, so they behave exactly the same.

const AvatarShop = lazy(() => import("../../components/avatar/AvatarShop").then((m) => ({ default: m.AvatarShop })));
const AvatarEditor = lazy(() => import("../../components/avatar/AvatarEditor").then((m) => ({ default: m.AvatarEditor })));
const InboxContent = lazy(() => import("../../pages/Inbox/page").then((m) => ({ default: m.InboxContent })));

const darkField =
  "w-full rounded-[3px] border border-[#f2ead2]/25 bg-[#0b1017]/70 px-3 py-2 text-sm text-[#f2ead2] focus:border-[#f2ead2]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2ead2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d131b]";

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
        <button type="button" className="shrink-0 text-[13px] text-[#f2ead2]/85 underline underline-offset-4 hover:text-[#f2ead2]" onClick={() => { setName(summary?.username || ""); setEditing(true); }}>
          Rename
        </button>
      )}
    </div>
  );
}

// (banner: one being tried on, behind you instead of yours)
// (below: under the ticket count, e.g. the shop's filters)
function Mirror({ look, eyebrow, note, large = false, roomy = false, renamable = false, banner, below }: { look: AvatarLook | null; eyebrow: string; note?: ReactNode; large?: boolean; roomy?: boolean; renamable?: boolean; banner?: string | null; below?: ReactNode }) {
  const { data: summary } = useSummary();
  const backdrop = useBackdrop(banner);
  // A banner being tried on: behind you there's only room for a slice of it, so the whole of it
  // runs along a strip as well, as it will along your row on the scoreboard (moving, if it does)
  const strip = banner ? (
    <div className="h-14 w-full shrink-0 rounded-[2px] ring-1 ring-[#f2ead2]/20 md:h-20" style={bannerStyle(banner)} role="img" aria-label="The banner, as it runs along the scoreboard" />
  ) : null;
  if (large)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex h-[30rem] items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20" style={backdrop}>
          <AvatarView look={look} height={440} />
        </div>
        {strip}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/85">{eyebrow}</p>
          <YourName renamable={renamable} />
          <TicketCount count={summary?.coinBalance} note={note} />
          {below}
        </div>
      </div>
    );
  return (
    <div className="mb-4 flex flex-col gap-2">
    <div className="flex items-center gap-4">
      <div className={`flex ${roomy ? "h-36 w-28" : "h-24 w-20"} shrink-0 items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20`} style={backdrop}>
        <AvatarView look={look} height={roomy ? 144 : 96} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/85">{eyebrow}</p>
        <YourName renamable={renamable} />
        <TicketCount count={summary?.coinBalance} note={note} />
        {below}
      </div>
    </div>
    {strip}
    </div>
  );
}

// How many tickets you have: the number and a ticket
function TicketCount({ count, note }: { count?: number | null; note?: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-amber-300">
      {count != null ? (
        <>
          <span aria-label={`${count.toLocaleString()} tickets`}>{count.toLocaleString()}</span>
          <TicketIcon className="h-4 w-6" perforation="#0b1017" />
        </>
      ) : (
        "…"
      )}
      {note}
    </p>
  );
}

// The shop's search, by the sheet's x: a magnifier that opens into a field (and folds
// back up when it's left empty)
function ShopSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(Boolean(value));
  if (!open && !value)
    return (
      <button type="button" aria-label="Search the shop" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center text-[#f2ead2]/85 hover:text-[#f2ead2]">
        <FaSearch className="h-[18px] w-[18px]" />
      </button>
    );
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-md border border-[#494054] bg-[#191620] px-3 text-[#92859f] focus-within:border-[#bda0de] md:max-w-sm">
      <FaSearch className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <input
        type="search"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => !value.trim() && setOpen(false)}
        placeholder="Search items"
        aria-label="Search the shop"
        className="min-w-0 flex-1 bg-transparent text-base text-[#eee5f8] placeholder:text-[#92859f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2ead2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d131b]"
      />
    </label>
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
  // A banner being tried on: behind you in the mirror
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  // What was last tried on: the shopkeeper, up in the dark, has a word about it
  const [tried, setTried] = useState<TriedOn | null>(null);
  // What's come in since you last looked round wears the "!" dot, for the whole of this visit;
  // leaving is having looked
  const [newSince] = useState(shopNewSince);
  useEffect(() => {
    if (!signedIn) return;
    // (a look of under a second isn't one: the shop opened and shut again at once)
    const opened = Date.now();
    return () => {
      if (Date.now() - opened > 1000) noteLooked("shop");
    };
  }, [signedIn]);
  const bannerItems = useBannerShopItems(previewBanner, setPreviewBanner, newSince);
  // (and songs for the radio on the bench; one being listened to stops when you leave)
  const songItems = useSongShopItems();
  useEffect(() => () => radio.endSample(), []);
  // (and cartridges for the arcade)
  const cartItems = useCartShopItems();
  const wares = [...bannerItems, ...songItems, ...cartItems];
  // Opened on an item (an advert over the window): searched for straight away
  const [filters, setFilters] = useState<ShopFilters>({ ...NO_FILTERS, search: focus ?? "" });
  const topBar = useContext(SheetActions);
  const unread = useInboxUnreadCount();
  const saved = useAvatarLook(signedIn);
  const extraCategories = [...new Map(wares.map((item) => [item.category, item.categoryPlural])).entries()];
  // (swiping sideways across the wares turns to the next tab)
  const swipe = useTabSwipe(filters, setFilters, extraCategories);
  if (!signedIn) return <TicketHoldersOnly what="The item shop's wares" goTo={goTo} />;
  const look = preview || saved;
  const note = preview || previewBanner ? <span className="ml-2 text-xs text-stone-400">(showing)</span> : null;
  const menus = <ShopFilterMenus filters={filters} onChange={setFilters} className="mt-2 max-w-[10rem]" />;
  // Full screen, as the wardrobe: you stay in view (beside the wares, or above them on a
  // phone) while only the wares scroll
  return (
    <>
    {/* (behind the shop: its top going off into the dark, and his eyes in it) */}
    <ShopKeeper tried={tried} />
    <div className="relative flex h-full min-h-0 flex-col gap-2 md:flex-row md:gap-8">
      {topBar && createPortal(<ShopSearch value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} />, topBar)}
      <div className="shrink-0 md:w-80">
        {/* (the tabs sit close under you: no gap of the mirror's own below it) */}
        <div className="md:hidden [&>div]:mb-0">
          <Mirror look={look} eyebrow="Item shop" note={note} roomy banner={previewBanner} below={menus} />
        </div>
        <div className="hidden md:block">
          <Mirror look={look} eyebrow="Item shop" note={note} large banner={previewBanner} below={menus} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <ShopCategoryTabs filters={filters} onChange={setFilters} extraCategories={extraCategories} className="shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" {...swipe}>
      <Classic>
        <AvatarShop onPreviewLookChange={setPreview} focusName={focus} extraItems={wares} filters={filters} onTryOn={setTried} newSince={newSince} />
        <MarketListings signedIn={signedIn} />
      </Classic>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-[#f2ead2]/15 pt-4">
        <button type="button" className={plateButton} onClick={() => goTo("lockers")}>
          Your locker: dress up
        </button>
        <button type="button" className={plateButton} onClick={() => goTo("mail", "letters")}>
          Inbox{unread ? ` (${unread})` : ""}
          {unread ? <NewsDot className="ml-1.5 align-middle" label="Unread mail" /> : null}
        </button>
        <button type="button" className={plateButton} onClick={() => goTo("mail", "register")}>
          Settings
        </button>
      </div>
      </div>
      </div>
    </div>
    </>
  );
}

export function Wardrobe({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [preview, setPreview] = useState<AvatarLook | null>(null);
  // Your skin, eyes and hair colour: a pencil under your tickets opens them
  const [editingLook, setEditingLook] = useState(false);
  const saved = useAvatarLook(signedIn);
  if (!signedIn) return <TicketHoldersOnly what="Lockers" goTo={goTo} />;
  const look = preview || saved;
  const note = preview ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null;
  const pencil = (
    <button
      type="button"
      onClick={() => setEditingLook((on) => !on)}
      aria-pressed={editingLook}
      aria-label={editingLook ? "Done editing your look" : "Edit your look"}
      title={editingLook ? "Done" : "Edit your look"}
      className={`mt-2 flex h-9 w-9 items-center justify-center rounded-md border transition ${
        editingLook ? "border-[#f2c35b] bg-[#f2c35b] text-[#281b35]" : "border-[#f2ead2]/30 text-[#f2ead2]/80 hover:border-[#f2ead2]/60 hover:text-[#f2ead2]"
      }`}
    >
      <FaPencilAlt className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
  // Full screen: you stay in view (beside the clothes, or above them on a phone) while
  // only the clothes scroll, so whatever you try on shows at once
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row md:gap-8">
      <div className="shrink-0 md:w-80">
        <div className="md:hidden">
          <Mirror look={look} eyebrow="Your locker" note={note} roomy renamable below={pencil} />
        </div>
        <div className="hidden md:block">
          <Mirror look={look} eyebrow="Your locker" note={note} large renamable below={pencil} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <Classic>
          <AvatarEditor
            onPreviewLookChange={setPreview}
            extraTab={{ key: "banners", label: "Banners", content: <BannerShelf /> }}
            initialTab="banners"
            editingLook={editingLook}
          />
        </Classic>
      </div>
    </div>
  );
}

export function Letters({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  if (!signedIn) return <TicketHoldersOnly what="Inboxes" goTo={goTo} />;
  return (
    <>
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/85">Inbox</p>
      <Classic>
        <InboxContent />
      </Classic>
    </>
  );
}

// Account controls live in the Settings register. Names are changed at the locker.
export function Register({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const features = useFeatures();
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState("");
  const [closing, setClosing] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const queryClient = useQueryClient();
  const { data: current } = useQuery({ queryKey: ["auth-email"], queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? null, enabled: signedIn });

  const act = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try { setMessage({ ok: true, text: await action() }); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "Something went wrong. Please try again." }); }
    finally { setBusy(false); setCurrentPassword(""); }
  };
  const reauthenticate = async () => {
    // Read the confirmed email immediately before acting; never use a proposed new email.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) throw new Error("Please sign in again first.");
    if (!currentPassword) throw new Error("Enter your current password first.");
    const result = await supabase.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
    if (result.error || result.data.user?.id !== data.user.id) throw new Error("Your current password did not match.");
  };
  const changePassword = () => act(async () => {
    await reauthenticate();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setPassword("");
    return "Password changed.";
  });
  const changeEmail = () => act(async () => {
    if (!features.emailChange) throw new Error("Email changes are coming soon.");
    await reauthenticate();
    const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: new URL("/station?at=mail&open=register", window.location.origin).toString() });
    if (error) throw error;
    setEmail("");
    return "Check both inboxes: confirm the change using the links sent to your current and new email addresses.";
  });
  const signOut = (global: boolean) => act(async () => {
    const { error } = await supabase.auth.signOut({ scope: global ? "global" : "local" });
    if (error) throw error;
    queryClient.clear();
    goTo("bulletin");
    return "Signed out.";
  });
  const download = () => act(async () => {
    const response = await fetchWithAuth("/user/export", { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json()).error || "Could not download your data.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = "wayside-station-data.json";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "Your data download is ready.";
  });
  const closeAccount = () => act(async () => {
    if (!features.accountDeletion) throw new Error("Account closure is coming soon.");
    await reauthenticate();
    const response = await fetchWithAuth("/user/account", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation, currentPassword }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not close your account.");
    // Closure already revoked the account server-side; always clear the local session.
    await supabase.auth.signOut({ scope: "local" });
    queryClient.clear();
    goTo("bulletin");
    return result.cleanupPending ? "Your account is closed. File and login cleanup will finish automatically." : "Your account is closed.";
  });

  return (
    <div className="space-y-6 text-sm text-stone-300" aria-busy={busy}>
      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/85">Settings</p>
        <h3 className="mt-1 text-xl text-[#f2ead2]" style={serif}>Your account</h3>
        <div role="status" aria-live="polite" aria-atomic="true">
          {message && <p className={`mt-2 ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p>}
        </div>
        {signedIn ? <>
          <p className="mt-1">Signed in as {current ?? "…"}. (Change your name at your locker.)</p>
          {!closing && <label className="mt-3 block max-w-sm">Current password
            <input className={`${darkField} mt-1`} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" disabled={busy} />
          </label>}
          <p className="mt-1">Required to change your password or email, or close your account.</p>
          <form className="mt-4 max-w-sm space-y-2" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
            <label className="block">New password
              <input className={`${darkField} mt-1`} type="password" placeholder="8 or more characters" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" disabled={busy} />
            </label>
            <button type="submit" className={plateButton} disabled={password.length < 8 || !currentPassword || busy}>Change password</button>
          </form>
          {features.emailChange ? <form className="mt-4 max-w-sm space-y-2" onSubmit={(e) => { e.preventDefault(); void changeEmail(); }}>
            <label className="block">New email
              <input className={`${darkField} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" disabled={busy} />
            </label>
            <p>Check both inboxes for the confirmation links. Your email changes after confirmation.</p>
            <button type="submit" className={plateButton} disabled={!email.trim() || !currentPassword || busy}>Change email</button>
          </form> : <p className="mt-4">Change email · Coming soon</p>}
          <button type="button" className={`${plateButton} mt-4`} disabled={busy} onClick={() => void download()}>Download my data</button>
        </> : <TicketHoldersOnly what="Account controls" goTo={goTo} />}
        <LegalPapers />
      </section>
      {signedIn && <>
        <AgentKeys />
        <BlockedRiders />
        <section>
          <h3 className="text-base text-[#f2ead2]" style={serif}>Heading out?</h3>
          <p className="mt-1">Your locker and inbox will be here when you get back.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={plateButton} disabled={busy} onClick={() => void signOut(false)}>Sign out</button>
            <button type="button" className={plateButton} disabled={busy} onClick={() => void signOut(true)}>Sign out everywhere</button>
          </div>
        </section>
        <section>
          <h3 className="text-base text-[#f2ead2]" style={serif}>Close your account</h3>
          <p className="mt-1">Erase your private data, photos, posts, items and coins, and free your email. Public scores, standings and past match results stay as “Deleted rider.” This cannot be undone.</p>
          {!features.accountDeletion ? <p className="mt-3">Coming soon</p> : !closing ? <button type="button" className={`${plateButton} mt-3`} disabled={busy} onClick={() => { setClosing(true); setConfirmation(""); setCurrentPassword(""); }}>Close your account</button> : (
            <form className="mt-3 max-w-sm space-y-2" onSubmit={(e) => { e.preventDefault(); if (confirmation === "DELETE") void closeAccount(); }}>
              <label className="block">Type DELETE to confirm
                <input className={`${darkField} mt-1`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} autoFocus required disabled={busy} />
              </label>
              <label className="block">Current password
                <input className={`${darkField} mt-1`} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required disabled={busy} />
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className={plateButton} disabled={confirmation !== "DELETE" || !currentPassword || busy}>Permanently close account</button>
                <button type="button" className={plateButton} disabled={busy} onClick={() => { setClosing(false); setConfirmation(""); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </>}
    </div>
  );
}

// Agent keys: let an AI agent (the wayside CLI, agent-cli/ in the repo) check tonight's movie
// and mark nights watched for you. A key is shown once; the server only keeps its hash.
type AgentKey = { id: number; name: string; hint: string; createdAt: string; lastUsedAt: string | null };

function AgentKeys() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: keys } = useQuery({
    queryKey: ["agent-tokens"],
    queryFn: async () => {
      const r = await fetchWithAuth("/agent-tokens", { cache: "no-store" });
      if (!r.ok) throw new Error("Could not load your agent keys");
      return ((await r.json()) as { data: AgentKey[] }).data;
    },
  });
  const send = async (path: string, init: RequestInit) => {
    const r = await fetchWithAuth(path, init);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Something went wrong");
    return body.data;
  };
  const create = useMutation({
    mutationFn: (keyName: string) =>
      send("/agent-tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: keyName }) }) as Promise<AgentKey & { token: string }>,
    onSuccess: (key) => {
      setFresh({ name: key.name, token: key.token });
      setCopied(false);
      setName("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["agent-tokens"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => send(`/agent-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["agent-tokens"] }),
    onError: (e: Error) => setError(e.message),
  });
  const copy = async () => {
    if (!fresh) return;
    await navigator.clipboard?.writeText(fresh.token).catch(() => {});
    setCopied(true);
  };

  return (
    <section>
      <h3 className="text-base text-[#f2ead2]" style={serif}>
        Agent keys
      </h3>
      <p className="mt-1 text-stone-400">
        Let an AI agent check tonight&apos;s movie and mark nights you&apos;ve watched (only nights that have come). It can&apos;t play, spend
        coins, or touch anything else.
      </p>
      {fresh && (
        <div className="mt-3 max-w-sm rounded border border-emerald-300/40 p-3">
          <p className="text-emerald-300">Your key for {fresh.name}. Copy it now; it won&apos;t be shown again.</p>
          <code className="mt-2 block break-all text-xs text-[#f2ead2]">{fresh.token}</code>
          <div className="mt-2 flex gap-2">
            <button type="button" className={plateButton} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className={plateButton} onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      )}
      {keys && keys.length > 0 && (
        <ul className="mt-3 max-w-sm space-y-1">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-2">
              <span>
                {key.name} <span className="text-stone-500">…{key.hint}</span>
                <span className="block text-xs text-stone-500">{key.lastUsedAt ? `Last used ${formatShortDate(key.lastUsedAt)}` : "Never used"}</span>
              </span>
              <button type="button" className={`${plateButton} shrink-0`} disabled={revoke.isPending} onClick={() => revoke.mutate(key.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(name.trim()); }}>
        <input className={darkField} placeholder="Name it, like Claude" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Agent key name" />
        <button type="submit" className={`${plateButton} shrink-0`} disabled={!name.trim() || create.isPending}>
          {create.isPending ? "…" : "Make key"}
        </button>
      </form>
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </section>
  );
}
