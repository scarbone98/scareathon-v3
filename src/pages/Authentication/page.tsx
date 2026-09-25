import "../../styles/auth.css";
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { FaArrowRight, FaCheck, FaCoins, FaEnvelope, FaEye, FaEyeSlash, FaFilm, FaGamepad, FaLock } from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import { supabase } from "../../supabaseClient";
import { Link, useNavigate, useLocation } from "react-router-dom";
import PasswordResetPopup from "../../components/PasswordResetPopup";
import { isRetryableAuthError } from "../../authErrors";

function authErrorMessage(error: unknown) {
  if (isRetryableAuthError(error) || error instanceof TypeError) {
    return "We couldn’t reach the haunted headquarters. Check your connection and try again in a moment.";
  }
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "invalid_credentials") return "That email and password don’t match. Try again, or reset your password below.";
  if (code === "email_not_confirmed") return "Check your inbox and confirm your email before logging in.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many attempts just now. Give it a minute, then try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

const Authentication = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedDestination = location.state?.from;
  const destination = typeof requestedDestination === "string" && requestedDestination.startsWith("/") && !requestedDestination.startsWith("//") && !requestedDestination.startsWith("/authentication")
    ? requestedDestination : "/profile";

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (active && user) navigate(destination, { replace: true });
      } catch {
        // Keep the form available when the session check cannot reach the server.
      } finally {
        if (active) setIsCheckingSession(false);
      }
    };
    void checkAuth();
    return () => { active = false; };
  }, [navigate, destination]);

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setError(null);
    setSignupSuccess(false);
    setShowPassword(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const credentials = { email: email.trim(), password };
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        navigate(destination, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp(credentials);
        if (error) throw error;
        if (data.session) {
          navigate(destination, { replace: true });
        } else if (data.user) {
          setSignupSuccess(true);
          setPassword("");
        } else {
          throw new Error("We couldn’t create your account. Please try again.");
        }
      }
    } catch (error: unknown) {
      setError(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatedPage className="auth-world">
      <div aria-hidden="true" className="auth-glow auth-glow-amber" />
      <div aria-hidden="true" className="auth-glow auth-glow-violet" />
      <div className="auth-layout">
        <section className="auth-welcome" aria-labelledby="auth-welcome-title">
          <span className="auth-pill">{isLogin ? "Good to see you again" : "Free to join"}</span>
          <h1 id="auth-welcome-title">{isLogin ? <>Welcome back<br /> to <span>the haunt.</span></> : <>Pull up a seat<br /> in <span>the haunt.</span></>}</h1>
          <p className="auth-intro">One account for the arcade, the October movie marathon, and your own spooky little avatar.</p>
          <ul className="auth-perks">
            <li className="auth-perk"><span className="auth-perk-icon"><FaGamepad aria-hidden="true" /></span><span>Save your arcade scores<small>Climb the leaderboards in every game.</small></span></li>
            <li className="auth-perk"><span className="auth-perk-icon"><FaCoins aria-hidden="true" /></span><span>Earn coins as you play<small>Spend them on looks for your avatar.</small></span></li>
            <li className="auth-perk"><span className="auth-perk-icon"><FaFilm aria-hidden="true" /></span><span>Join Scareathon<small>A horror movie a day, all October.</small></span></li>
          </ul>
        </section>

        <section className="auth-card" aria-labelledby="auth-form-title">
          <div className="auth-mode-switch" aria-label="Account access">
            <button type="button" aria-pressed={isLogin} disabled={isSubmitting} onClick={() => switchMode(true)}>Log in</button>
            <button type="button" aria-pressed={!isLogin} disabled={isSubmitting} onClick={() => switchMode(false)}>Sign up</button>
          </div>
          {signupSuccess ? (
            <div className="auth-confirmation" role="status">
              <span className="auth-card-icon"><FaEnvelope aria-hidden="true" /></span>
              <h2 id="auth-form-title">Check your inbox</h2>
              <p>Look for a confirmation link at <strong>{email.trim()}</strong>. Follow it to finish setting up your account.</p>
              <p>Can’t find it? Check your spam folder. If you already have an account, try logging in or resetting your password.</p>
              <button type="button" className="auth-submit" onClick={() => switchMode(true)}>Back to log in <FaArrowRight /></button>
              <button type="button" className="auth-text-button" onClick={() => setSignupSuccess(false)}>Use a different email</button>
            </div>
          ) : (
            <>
              <header className="auth-form-heading">
                <img src="/images/popcornzombie.webp" alt="" className="auth-mascot" />
                <h2 id="auth-form-title">{isLogin ? "Log in" : "Create your account"}</h2>
                <p>{isLogin ? "Your scores, coins and avatar are waiting." : "It takes a few seconds. Just an email and a password."}</p>
              </header>
              <form onSubmit={handleSubmit} className="auth-form" aria-busy={isSubmitting}>
                <div className="auth-field">
                  <label htmlFor="auth-email">Email address</label>
                  <div className="auth-input-wrap"><FaEnvelope aria-hidden="true" /><input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required placeholder="you@example.com" value={email} disabled={isSubmitting} onChange={(event) => { setEmail(event.target.value); setError(null); }} /></div>
                </div>
                <div className="auth-field">
                  <div className="auth-label-row"><label htmlFor="auth-password">Password</label>{isLogin && <button type="button" className="auth-text-button" disabled={isSubmitting} onClick={() => setShowPasswordReset(true)}>Forgot password?</button>}</div>
                  <div className="auth-input-wrap"><FaLock aria-hidden="true" /><input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"} minLength={isLogin ? undefined : 8} required placeholder={isLogin ? "Your password" : "Create a password"} value={password} disabled={isSubmitting} aria-describedby={!isLogin ? "auth-password-hint" : undefined} onChange={(event) => { setPassword(event.target.value); setError(null); }} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <FaEyeSlash /> : <FaEye />}</button></div>
                  {!isLogin && <p id="auth-password-hint" className="auth-helper"><FaCheck aria-hidden="true" /> At least 8 characters. Make it unique to you.</p>}
                </div>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <button type="submit" className="auth-submit" disabled={isSubmitting || isCheckingSession}>{isSubmitting ? (isLogin ? "Logging in…" : "Creating your account…") : isCheckingSession ? "Getting ready…" : isLogin ? "Log in" : "Create account"}<FaArrowRight aria-hidden="true" /></button>
              </form>
              <p className="auth-switch-prompt">{isLogin ? "New here?" : "Already have an account?"} <button type="button" className="auth-text-button" disabled={isSubmitting} onClick={() => switchMode(!isLogin)}>{isLogin ? "Create an account" : "Log in"}</button></p>
            </>
          )}
        </section>
        <Link to="/" className="auth-home-link">Just looking around? Back to the home page <FaArrowRight aria-hidden="true" /></Link>
      </div>
      {showPasswordReset && <PasswordResetPopup onClose={() => setShowPasswordReset(false)} initialEmail={email} />}
    </AnimatedPage>
  );
};

export default Authentication;
