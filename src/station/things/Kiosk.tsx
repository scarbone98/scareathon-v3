import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../supabaseClient";
import { isRetryableAuthError } from "../../authErrors";
import PasswordResetPopup from "../../components/PasswordResetPopup";
import { AvatarView } from "../../components/avatar/AvatarView";
import { useInboxUnreadCount } from "../../pages/Inbox/useInboxUnreadCount";
import { useSummary } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { useAvatarLook } from "./Belongings.tsx";
import { serif, stubButton } from "../style/theme.ts";

// The ticket kiosk. Its window is where you sign in (or buy a ticket, i.e. sign up), and
// once you have a ticket it shows yours, with the way to the item shop.

const field =
  "w-full rounded-[2px] border border-[#2a1d14]/30 bg-[#fffaf0]/90 px-2.5 py-1.5 text-[15px] text-[#2a1d14] placeholder:text-[#2a1d14]/40 focus:border-[#2a1d14]/70 focus:outline-none";

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


// Your ticket, shown in the window once you've signed in: who you are, your coins, the
// shop, and where the rest of your things are kept
function TicketCard({ onShop, goTo }: { onShop: () => void; goTo: GoTo }) {
  const { data: summary } = useSummary();
  const unread = useInboxUnreadCount();
  const look = useAvatarLook();
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
        <div className="mt-auto space-y-1.5">
          <button type="button" className={`${stubButton} w-full justify-center`} onClick={onShop}>
            Item shop
          </button>
          <div className="flex gap-3 text-[13px]">
            <button type="button" className="underline decoration-[#2a1d14]/40 underline-offset-4" onClick={() => goTo("lockers")}>
              Your locker
            </button>
            <button type="button" className="underline decoration-[#2a1d14]/40 underline-offset-4" onClick={() => goTo("mail")}>
              {unread ? `${unread} letter${unread === 1 ? "" : "s"} waiting` : "Your pigeonhole"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// What's behind the kiosk's glass. `glass`: drawn as the card behind the glass; off when a
// phone holds it in its own card
export function KioskWindow({ signedIn, onShop, goTo, glass = true }: { signedIn: boolean | undefined; onShop: () => void; goTo: GoTo; glass?: boolean }) {
  return (
    <div className={glass ? "h-full w-full bg-[#efe3c8]/90 p-4 shadow-[inset_0_0_30px_rgba(120,70,20,0.35)]" : "h-full w-full"} style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {signedIn === undefined ? <p className="italic opacity-60">…</p> : signedIn ? <TicketCard onShop={onShop} goTo={goTo} /> : <SignInCard />}
    </div>
  );
}
