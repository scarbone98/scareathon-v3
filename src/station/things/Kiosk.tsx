import "../../styles/profile.css";
import { Suspense, lazy, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { isRetryableAuthError } from "../../authErrors";
import PasswordResetPopup from "../../components/PasswordResetPopup";
import { AvatarView } from "../../components/avatar/AvatarView";
import { lookFromAvatar } from "../../components/avatar/look";
import type { AvatarLook, AvatarResponse } from "../../components/avatar/types";
import { useInboxUnreadCount } from "../../pages/Inbox/useInboxUnreadCount";
import { useSummary } from "../data.ts";
import type { CatalogueTab } from "../stops.ts";
import { Loading, Problem, Tabs } from "../style/ui.tsx";
import { plateButton, serif, stubButton } from "../style/theme.ts";

// The ticket kiosk. Its window is where you sign in (or buy a ticket, i.e. sign up), and
// once you have a ticket it shows yours: name, coins, mail. Asking for the shop, the
// wardrobe, the inbox or your account slides that across the counter (Catalogue, shown
// in a Sheet). The shop, wardrobe and inbox are the classic site's own components.

const AvatarShop = lazy(() => import("../../components/avatar/AvatarShop").then((m) => ({ default: m.AvatarShop })));
const AvatarEditor = lazy(() => import("../../components/avatar/AvatarEditor").then((m) => ({ default: m.AvatarEditor })));
const InboxContent = lazy(() => import("../../pages/Inbox/page").then((m) => ({ default: m.InboxContent })));


const field =
  "w-full rounded-[2px] border border-[#2a1d14]/30 bg-[#fffaf0]/90 px-2.5 py-1.5 text-[15px] text-[#2a1d14] placeholder:text-[#2a1d14]/40 focus:border-[#2a1d14]/70 focus:outline-none";
const darkField =
  "w-full rounded-[3px] border border-[#f2ead2]/25 bg-[#0b1017]/70 px-3 py-2 text-sm text-[#f2ead2] focus:border-[#f2ead2]/70 focus:outline-none";

function authErrorMessage(error: unknown) {
  if (isRetryableAuthError(error) || error instanceof TypeError) return "The line to headquarters is down. Try again in a moment.";
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "invalid_credentials") return "That email and password don't match.";
  if (code === "email_not_confirmed") return "Confirm your email first; the link's in your inbox.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many tries. Give it a minute.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

// A card held up behind the glass: the sign-in form
function SignInCard() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState(false);
  const [resetting, setResetting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const credentials = { email: email.trim(), password };
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword(credentials);
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp(credentials);
        if (signUpError) throw signUpError;
        if (!data.session && data.user) {
          setSentConfirmation(true);
          setPassword("");
        } else if (!data.user) {
          throw new Error("We couldn't issue your ticket. Please try again.");
        }
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (sentConfirmation) {
    return (
      <div className="text-[#2a1d14]">
        <p className="text-[22px]" style={serif}>
          Check your inbox
        </p>
        <p className="mt-2 text-[15px] leading-snug">
          A confirmation link is on its way to <strong>{email.trim()}</strong>. Follow it, then come back and show your ticket.
        </p>
        <button type="button" className={`${stubButton} mt-3`} onClick={() => { setSentConfirmation(false); setIsLogin(true); }}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="text-[#2a1d14]">
      <p className="text-[22px] leading-tight" style={serif}>
        {isLogin ? "Show your ticket" : "Buy a ticket (it's free)"}
      </p>
      <p className="text-[13px] opacity-70">Save scores, earn coins, dress your avatar.</p>
      <form onSubmit={submit} className="mt-2 space-y-1.5" aria-busy={busy}>
        <input className={field} type="email" autoComplete="email" placeholder="Email" aria-label="Email" required value={email} disabled={busy} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
        <input
          className={field}
          type="password"
          placeholder={isLogin ? "Password" : "Password (8 or more characters)"}
          aria-label="Password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={isLogin ? undefined : 8}
          required
          value={password}
          disabled={busy}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
        />
        {error && <p className="text-[13px] font-semibold text-red-800">{error}</p>}
        <div className="flex items-center gap-3 pt-0.5">
          <button type="submit" className={stubButton} disabled={busy}>
            {busy ? "One moment…" : isLogin ? "Sign in" : "Create account"}
          </button>
          {isLogin && (
            <button type="button" className="text-[13px] underline underline-offset-4 opacity-75 hover:opacity-100" onClick={() => setResetting(true)}>
              Forgot password?
            </button>
          )}
        </div>
      </form>
      <p className="mt-2 text-[13px]">
        {isLogin ? "New here? " : "Have a ticket? "}
        <button type="button" className="font-semibold underline underline-offset-4" onClick={() => { setIsLogin(!isLogin); setError(null); }}>
          {isLogin ? "Buy a ticket" : "Sign in"}
        </button>
      </p>
      {resetting && <PasswordResetPopup onClose={() => setResetting(false)} initialEmail={email} />}
    </div>
  );
}

function useAvatarLook() {
  const { data: avatar } = useQuery<AvatarResponse>({
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

// Your ticket, shown in the window once you've signed in
function TicketCard({ onOpen }: { onOpen: (tab: CatalogueTab) => void }) {
  const { data: summary } = useSummary();
  const unread = useInboxUnreadCount();
  const look = useAvatarLook();
  const buttons: [CatalogueTab, string][] = [
    ["shop", "Item shop"],
    ["wardrobe", "Dress up"],
    ["inbox", unread ? `Inbox (${unread})` : "Inbox"],
    ["account", "Account"],
  ];
  return (
    <div className="flex h-full gap-4 text-[#2a1d14]">
      <div className="flex w-28 shrink-0 items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#120d08]">
        <AvatarView look={look} height={150} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] uppercase tracking-[0.25em] opacity-60">Ticket holder</p>
        <p className="truncate text-[26px] leading-tight" style={serif}>
          {summary?.username ?? "…"}
        </p>
        <p className="text-[16px] font-semibold">{summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "…"}</p>
        <div className="mt-auto grid grid-cols-2 gap-1.5">
          {buttons.map(([tab, label]) => (
            <button key={tab} type="button" className={`${stubButton} justify-center px-2 text-[13px]`} onClick={() => onOpen(tab)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// What's behind the kiosk's glass
// `glass`: drawn as the card behind the kiosk's glass; off when a phone holds it in its own card
export function KioskWindow({ signedIn, onOpen, glass = true }: { signedIn: boolean | undefined; onOpen: (tab: CatalogueTab) => void; glass?: boolean }) {
  return (
    <div className={glass ? "h-full w-full bg-[#efe3c8]/90 p-4 shadow-[inset_0_0_30px_rgba(120,70,20,0.35)]" : "h-full w-full"} style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {signedIn === undefined ? <p className="italic opacity-60">…</p> : signedIn ? <TicketCard onOpen={onOpen} /> : <SignInCard />}
    </div>
  );
}

function Account() {
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

  return (
    <div className="space-y-6 text-sm text-stone-300">
      <section>
        <h3 className="text-base text-[#f2ead2]" style={serif}>
          Your name around here
        </h3>
        <p className="mt-1 text-stone-400">How other passengers see you.</p>
        {editing ? (
          <form
            className="mt-3 max-w-sm space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(null);
              if (name && !invalid) mutate();
            }}
          >
            <input className={darkField} autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid} aria-label="Username" />
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
          <div className="mt-3 flex items-center gap-3">
            <strong className="text-lg text-[#f2ead2]" style={serif}>
              {user?.data?.username ?? "…"}
            </strong>
            <button type="button" className={plateButton} onClick={() => { setName(user?.data?.username || ""); setEditing(true); setMessage(null); }}>
              Edit name
            </button>
          </div>
        )}
        {message && <p className="mt-2 text-emerald-300">{message}</p>}
      </section>
      <section>
        <h3 className="text-base text-[#f2ead2]" style={serif}>
          Heading out?
        </h3>
        <p className="mt-1 text-stone-400">Your character will be here when you get back.</p>
        <button type="button" className={`${plateButton} mt-3`} onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}

// Slid across the counter: the shop, the wardrobe, the inbox and the account, with your
// character alongside so you can see what you're trying on
export function Catalogue({ initialTab }: { initialTab: CatalogueTab }) {
  const [tab, setTab] = useState<CatalogueTab>(initialTab);
  const [previewLook, setPreviewLook] = useState<AvatarLook | null>(null);
  const { data: summary } = useSummary();
  const unread = useInboxUnreadCount();
  const savedLook = useAvatarLook();
  const look = previewLook || savedLook;

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-24 w-20 shrink-0 items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] ring-1 ring-[#f2ead2]/20">
          <AvatarView look={look} height={92} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#f2ead2]/50">Ticket kiosk</p>
          <p className="truncate text-2xl text-[#f2ead2]" style={serif}>
            {summary?.username ?? "…"}
          </p>
          <p className="text-sm text-amber-300">
            {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "…"}
            {previewLook && (tab === "shop" || tab === "wardrobe") ? <span className="ml-2 text-xs text-stone-400">(trying on)</span> : null}
          </p>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "shop", label: "Item shop" },
          { id: "wardrobe", label: "Dress up" },
          { id: "inbox", label: "Inbox", badge: unread },
          { id: "account", label: "Account" },
        ]}
      />
      {/* The classic components expect the profile page's styles around them */}
      <div className="profile-world" style={{ paddingBottom: 0 }}>
        <Suspense fallback={<Loading />}>
          {tab === "shop" && <AvatarShop onPreviewLookChange={setPreviewLook} />}
          {tab === "wardrobe" && <AvatarEditor onPreviewLookChange={setPreviewLook} />}
          {tab === "inbox" && <InboxContent />}
        </Suspense>
      </div>
      {tab === "account" && <Account />}
    </>
  );
}
