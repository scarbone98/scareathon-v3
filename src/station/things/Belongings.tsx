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
function Mirror({ look, eyebrow, note }: { look: AvatarLook | null; eyebrow: string; note?: ReactNode }) {
  const { data: summary } = useSummary();
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className="flex h-24 w-20 shrink-0 items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20">
        <AvatarView look={look} height={96} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">{eyebrow}</p>
        <p className="truncate text-2xl text-[#f2ead2]" style={serif}>
          {summary?.username ?? "…"}
        </p>
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

export function Shop({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [preview, setPreview] = useState<AvatarLook | null>(null);
  const unread = useInboxUnreadCount();
  const saved = useAvatarLook(signedIn);
  if (!signedIn) return <TicketHoldersOnly what="The item shop's wares" goTo={goTo} />;
  return (
    <>
      <Mirror look={preview || saved} eyebrow="Item shop" note={preview ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null} />
      <Classic>
        <AvatarShop onPreviewLookChange={setPreview} />
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
    </>
  );
}

export function Wardrobe({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const [preview, setPreview] = useState<AvatarLook | null>(null);
  const saved = useAvatarLook(signedIn);
  if (!signedIn) return <TicketHoldersOnly what="Lockers" goTo={goTo} />;
  return (
    <>
      <Mirror look={preview || saved} eyebrow="Your locker" note={preview ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null} />
      <Classic>
        <AvatarEditor onPreviewLookChange={setPreview} />
      </Classic>
    </>
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

// The station register: a ledger where passengers sign their names. Your name here is
// your username; signing out of the register signs you out.
export function Register({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () =>
      fetchWithAuth("/user").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        return data;
      }),
    enabled: signedIn,
  });
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
      setMessage("Name updated.");
    },
  });

  if (!signedIn) return <TicketHoldersOnly what="Settings" goTo={goTo} />;
  return (
    <div className="space-y-6 text-sm text-stone-300">
      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Settings</p>
        <h3 className="mt-1 text-xl text-[#f2ead2]" style={serif}>
          Your name
        </h3>
        <p className="mt-1 text-stone-400">It's how other passengers see you.</p>
        {editing ? (
          <form
            className="mt-3 max-w-sm space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(null);
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
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <strong className="text-2xl text-[#f2ead2]" style={{ ...serif, fontStyle: "italic" }}>
              {user?.data?.username ?? "…"}
            </strong>
            <button type="button" className={plateButton} onClick={() => { setName(user?.data?.username || ""); setEditing(true); setMessage(null); }}>
              Change name
            </button>
          </div>
        )}
        {message && <p className="mt-2 text-emerald-300">{message}</p>}
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
