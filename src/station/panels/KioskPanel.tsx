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
import { Loading, PanelHeading, Problem, Tabs } from "./ui.tsx";
import { serif } from "./theme.ts";

// The ticket kiosk: sign in (or buy a ticket, i.e. sign up), then the visitor's own
// things: coins, the shop, dressing up, the inbox and the account. The shop, wardrobe
// and inbox are the classic site's own components, so they behave exactly the same.

const AvatarShop = lazy(() => import("../../components/avatar/AvatarShop").then((m) => ({ default: m.AvatarShop })));
const AvatarEditor = lazy(() => import("../../components/avatar/AvatarEditor").then((m) => ({ default: m.AvatarEditor })));
const InboxContent = lazy(() => import("../../pages/Inbox/page").then((m) => ({ default: m.InboxContent })));

const field = "w-full rounded-sm border border-amber-200/20 bg-black/40 px-3 py-2 text-sm text-amber-50 placeholder:text-stone-500 focus:border-amber-300/60 focus:outline-none";
const primary = "rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-stone-900 transition hover:bg-amber-200 disabled:opacity-60";
const secondary = "rounded-full px-4 py-1.5 text-sm text-amber-100/80 ring-1 ring-amber-200/25 transition hover:bg-amber-100/5";

function authErrorMessage(error: unknown) {
  if (isRetryableAuthError(error) || error instanceof TypeError) return "The line to headquarters is down. Check your connection and try again in a moment.";
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "invalid_credentials") return "That email and password don't match. Try again, or reset your password.";
  if (code === "email_not_confirmed") return "Check your inbox and confirm your email before signing in.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many attempts just now. Give it a minute, then try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function SignIn() {
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
      <div className="space-y-3 text-sm text-stone-300">
        <PanelHeading eyebrow="Ticket kiosk" title="Check your inbox" />
        <p>
          A confirmation link is on its way to <strong className="text-amber-100">{email.trim()}</strong>. Follow it to finish your ticket, then come back and sign in.
        </p>
        <button type="button" className={primary} onClick={() => { setSentConfirmation(false); setIsLogin(true); }}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <PanelHeading eyebrow="Ticket kiosk" title={isLogin ? "Show your ticket" : "Buy a ticket (it's free)"}>
        One account for the arcade, the October marathon, and your own spooky little avatar. Save your scores, earn coins as you play, and spend them here.
      </PanelHeading>
      <form onSubmit={submit} className="space-y-3" aria-busy={busy}>
        <label className="block text-xs uppercase tracking-widest text-amber-200/60">
          Email
          <input className={`${field} mt-1 normal-case tracking-normal`} type="email" autoComplete="email" required value={email} disabled={busy} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
        </label>
        <label className="block text-xs uppercase tracking-widest text-amber-200/60">
          Password
          <input
            className={`${field} mt-1 normal-case tracking-normal`}
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={isLogin ? undefined : 8}
            required
            value={password}
            disabled={busy}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
          />
        </label>
        {!isLogin && <p className="text-xs text-stone-400">At least 8 characters.</p>}
        {error && <Problem message={error} />}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" className={primary} disabled={busy}>
            {busy ? "One moment…" : isLogin ? "Sign in" : "Create account"}
          </button>
          {isLogin && (
            <button type="button" className="text-sm text-amber-300/80 hover:text-amber-200" onClick={() => setResetting(true)}>
              Forgot password?
            </button>
          )}
        </div>
      </form>
      <p className="mt-5 text-sm text-stone-400">
        {isLogin ? "New here? " : "Already have a ticket? "}
        <button type="button" className="text-amber-300 underline underline-offset-4" onClick={() => { setIsLogin(!isLogin); setError(null); }}>
          {isLogin ? "Buy a ticket" : "Sign in"}
        </button>
      </p>
      {resetting && <PasswordResetPopup onClose={() => setResetting(false)} initialEmail={email} />}
    </>
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
        <h3 className="text-base text-amber-100" style={serif}>
          Your name around here
        </h3>
        <p className="mt-1 text-stone-400">How other passengers see you.</p>
        {editing ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(null);
              if (name && !invalid) mutate();
            }}
          >
            <input className={field} autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid} />
            {invalid && <Problem message="1–32 letters, numbers and underscores only." />}
            {error && <Problem message={error.message} />}
            <div className="flex gap-2">
              <button type="submit" className={primary} disabled={!name || invalid || isPending}>
                {isPending ? "Saving…" : "Save name"}
              </button>
              <button type="button" className={secondary} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <strong className="text-lg text-amber-50" style={serif}>
              {user?.data?.username ?? "…"}
            </strong>
            <button type="button" className={secondary} onClick={() => { setName(user?.data?.username || ""); setEditing(true); setMessage(null); }}>
              Edit name
            </button>
          </div>
        )}
        {message && <p className="mt-2 text-emerald-300">{message}</p>}
      </section>
      <section>
        <h3 className="text-base text-amber-100" style={serif}>
          Heading out?
        </h3>
        <p className="mt-1 text-stone-400">Your character will be here when you get back.</p>
        <button type="button" className={`${secondary} mt-3`} onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}

type Tab = "shop" | "wardrobe" | "inbox" | "account";

function TicketHolder() {
  const [tab, setTab] = useState<Tab>("shop");
  const [previewLook, setPreviewLook] = useState<AvatarLook | null>(null);
  const { data: summary } = useSummary();
  const unread = useInboxUnreadCount();
  const { data: avatar } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () =>
      fetchWithAuth("/user/avatar").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load avatar");
        return data;
      }),
  });
  const look = previewLook || (avatar ? lookFromAvatar(avatar.data) : null);
  const showAvatar = tab === "shop" || tab === "wardrobe";

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-24 w-20 shrink-0 items-end justify-center overflow-hidden rounded-sm bg-gradient-to-b from-[#2a2238] to-[#120d08] ring-1 ring-amber-200/15">
          <AvatarView look={look} height={92} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200/50">Ticket holder</p>
          <p className="truncate text-2xl text-amber-100" style={serif}>
            {summary?.username ?? "…"}
          </p>
          <p className="text-sm text-amber-300">
            {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "…"}
            {previewLook && showAvatar ? <span className="ml-2 text-xs text-stone-400">(previewing)</span> : null}
          </p>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "shop", label: "Shop" },
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

export default function KioskPanel({ signedIn }: { signedIn: boolean | undefined }) {
  if (signedIn === undefined) return <Loading label="Opening the window" />;
  return signedIn ? <TicketHolder /> : <SignIn />;
}
