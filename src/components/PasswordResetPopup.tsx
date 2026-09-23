import React, { useState, useEffect, useRef } from "react";
import { FaArrowRight, FaEnvelope, FaTimes } from "react-icons/fa";
import { supabase } from "../supabaseClient";

interface PasswordResetProps {
  onClose: () => void;
  initialEmail: string;
}

const PasswordResetPopup: React.FC<PasswordResetProps> = ({
  onClose,
  initialEmail,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL("/reset-password", window.location.origin).toString(),
      });
      if (error) throw error;
      setMessage("Password reset email sent. Please check your inbox.");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Unable to send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="auth-reset-dialog" aria-labelledby="reset-dialog-title" onCancel={onClose}>
      <button type="button" className="auth-reset-close" aria-label="Close password reset" onClick={onClose}><FaTimes /></button>
      <span className="auth-card-icon"><FaEnvelope aria-hidden="true" /></span>
      <h2 id="reset-dialog-title">Lost your way in?</h2>
      <p className="auth-reset-intro">Enter your account email and we’ll send a link to choose a new password.</p>
      <form onSubmit={handleSubmit} className="auth-form" aria-busy={isSubmitting}>
        <div className="auth-field">
          <label htmlFor="reset-email">Email address</label>
          <div className="auth-input-wrap"><FaEnvelope aria-hidden="true" /><input id="reset-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setMessage(null); }} placeholder="you@example.com" disabled={isSubmitting} required /></div>
        </div>
        {message && <p className="auth-reset-message" role="status">{message}</p>}
        <button type="submit" disabled={isSubmitting} className="auth-submit">{isSubmitting ? "Sending…" : "Send reset link"}<FaArrowRight aria-hidden="true" /></button>
      </form>
      <button type="button" className="auth-text-button auth-reset-back" onClick={onClose}>Back to log in</button>
    </dialog>
  );
};

export default PasswordResetPopup;
