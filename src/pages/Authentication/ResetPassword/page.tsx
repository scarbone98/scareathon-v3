import "../../../styles/auth.css";
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FaArrowRight, FaCheck, FaLock } from "react-icons/fa";
import { supabase } from "../../../supabaseClient";
import AnimatedPage from "../../../components/AnimatedPage";

// Where the password-reset email lands: choose a new password, then back to log in
const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // An expired or already-used link comes back with the error in the URL
    const hashParams = new URLSearchParams(location.hash.slice(1));
    const errorCode = hashParams.get("error_code");
    const errorDescription = hashParams.get("error_description");

    if (errorCode && errorDescription) {
      setError(`${decodeURIComponent(errorDescription.replace(/\+/g, " "))}. Ask for a new reset link from the log in page.`);
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Those passwords don’t match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate("/authentication"), 3000); // Back to log in after 3 seconds
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Couldn’t update your password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatedPage className="auth-world">
      <div aria-hidden="true" className="auth-glow auth-glow-amber" />
      <div aria-hidden="true" className="auth-glow auth-glow-violet" />
      <div className="auth-layout auth-layout-single">
        <section className="auth-card" aria-labelledby="reset-title">
          <header className="auth-form-heading" style={{ marginTop: 4 }}>
            <span className="auth-card-icon"><FaLock aria-hidden="true" /></span>
            <h2 id="reset-title">Choose a new password</h2>
            <p>Pick something you haven’t used here before.</p>
          </header>
          {success ? (
            <p className="auth-success" role="status">Password updated. Taking you back to log in…</p>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div className="auth-field">
                <label htmlFor="new-password">New password</label>
                <div className="auth-input-wrap">
                  <FaLock aria-hidden="true" />
                  <input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    placeholder="At least 8 characters"
                    value={newPassword}
                    disabled={isSubmitting}
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                  />
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <div className="auth-input-wrap">
                  <FaCheck aria-hidden="true" />
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    placeholder="Type it again"
                    value={confirmPassword}
                    disabled={isSubmitting}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  />
                </div>
              </div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button type="submit" className="auth-submit" disabled={isSubmitting || !newPassword || !confirmPassword}>
                {isSubmitting ? "Saving…" : "Save new password"}
                <FaArrowRight aria-hidden="true" />
              </button>
            </form>
          )}
          <p className="auth-switch-prompt">
            <Link to="/authentication" className="auth-text-button">Back to log in</Link>
          </p>
        </section>
      </div>
    </AnimatedPage>
  );
};

export default ResetPassword;
