import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

interface PasswordResetProps {
  onClose: () => void;
  initialEmail: string;
}

const PasswordResetPopup: React.FC<PasswordResetProps> = ({
  onClose,
  initialEmail,
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage("Password reset email sent. Please check your inbox.");
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-950 p-8 rounded-xl shadow-2xl max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-4">Reset Password</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-3 py-2 bg-gray-800 text-white rounded-md mb-4"
            required
          />
          <button
            type="submit"
            className="w-full bg-orange-600 text-white py-2 rounded-md hover:bg-orange-700 transition-colors duration-200"
          >
            Send Reset Link
          </button>
        </form>
        {message && (
          <p className="mt-4 text-sm text-center text-orange-400">{message}</p>
        )}
        <button
          onClick={onClose}
          className="mt-4 w-full bg-gray-800 text-white py-2 rounded-md hover:bg-gray-700 transition-colors duration-200"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PasswordResetPopup;
