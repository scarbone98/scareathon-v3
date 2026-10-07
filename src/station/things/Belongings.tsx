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
import { useSummary } from "../data.ts";
import { useInboxUnreadCount } from "../../pages/Inbox/useInboxUnreadCount";
import type { GoTo } from "../stops.ts";
import { Loading, Problem } from "../style/ui.tsx";
import { plateButton, serif, stubButton } from "../style/theme.ts";
import { BannerShelf, useBackdrop, useBannerShopItems } from "./Banners.tsx";
import { bannerStyle } from "../banners.ts";
import { NO_FILTERS, ShopCategoryTabs, ShopFilterMenus, useTabSwipe, type ShopFilters } from "../../components/avatar/shopFilters";
import TicketIcon from "../../components/TicketIcon";
import { SheetActions } from "../Sheet.tsx";
import ShopKeeper, { type TriedOn } from "./ShopKeeper.tsx";
import { useSongShopItems } from "./Songs.tsx";
import { useCartShopItems } from "./Carts.tsx";
import { radio } from "../radio.ts";

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
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">{eyebrow}</p>
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
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">{eyebrow}</p>
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
      <button type="button" aria-label="Search the shop" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center text-[#f2ead2]/70 hover:text-[#f2ead2]">
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
        className="min-w-0 flex-1 bg-transparent text-base text-[#eee5f8] placeholder:text-[#92859f] focus:outline-none"
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
  const bannerItems = useBannerShopItems(previewBanner, setPreviewBanner);
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
        <AvatarShop onPreviewLookChange={setPreview} focusName={focus} extraItems={wares} filters={filters} onTryOn={setTried} />
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
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Inbox</p>
      <Classic>
        <InboxContent />
      </Classic>
    </>
  );
}

// Settings, kept in the station register by the pigeonholes: your account (your password;
// the email can't be changed) and signing out. (Your name is changed at your locker.)
export function Register({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: current } = useQuery({ queryKey: ["auth-email"], queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? null, enabled: signedIn });

  if (!signedIn) return <TicketHoldersOnly what="Settings" goTo={goTo} />;
  const changePassword = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    setPassword("");
    setMessage({ ok: true, text: "Password changed." });
  };
  return (
    <div className="space-y-6 text-sm text-stone-300">
      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Settings</p>
        <h3 className="mt-1 text-xl text-[#f2ead2]" style={serif}>
          Your account
        </h3>
        <p className="mt-1 text-stone-400">Signed in as {current ?? "…"}. (Change your name at your locker.)</p>
        <form className="mt-3 flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); if (password.length >= 6) void changePassword(); }}>
          <input className={darkField} type="password" placeholder="New password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" autoComplete="new-password" />
          <button type="submit" className={`${plateButton} shrink-0`} disabled={password.length < 6 || busy}>
            {busy ? "…" : "Change"}
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
