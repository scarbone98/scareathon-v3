import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { fetchWithAuth } from "../../fetchWithAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FaCheck,
  FaCog,
  FaCoins,
  FaEdit,
  FaEnvelope,
  FaSignOutAlt,
  FaTimes,
} from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient"; // Make sure this import is correct
import { AvatarEditor } from "../../components/avatar/AvatarEditor";
import { InboxContent } from "../Inbox/page";

type WalletData = {
  data: {
    coinBalance: number;
    updatedAt?: string;
  };
};

type InboxSummary = {
  data: Array<{
    unreadCount?: number;
  }>;
};

const Profile = () => {
  const [newUsername, setNewUsername] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    data: userData,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery({
    queryKey: ["user"],
    queryFn: () => fetchWithAuth("/user").then((res) => res.json()),
  });

  const {
    data: walletData,
    isLoading: isWalletLoading,
    error: walletError,
  } = useQuery<WalletData>({
    queryKey: ["user", "wallet"],
    queryFn: () =>
      fetchWithAuth("/user/wallet?limit=1").then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load wallet");
        }
        return data;
      }),
  });

  const { data: inboxSummary } = useQuery<InboxSummary>({
    queryKey: ["inbox", "conversations"],
    queryFn: () =>
      fetchWithAuth("/inbox/conversations?limit=25").then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load inbox");
        }
        return data;
      }),
    staleTime: 1000 * 30,
  });

  const { mutate: updateUsername, isPending: isUpdatingUsername } = useMutation(
    {
      mutationFn: () =>
        fetchWithAuth("/user/updateUsername", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newUsername }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Failed to update username");
          }
          return data;
        }),
      onSuccess: (data) => {
        setSuccessMessage("Username updated successfully!");
        setNewUsername("");
        // Update the local userData state with the new username
        if (userData) {
          userData.data.username = data.data.username;
        }
        setIsEditing(false);
      },
      onError: (error: Error) => {
        setSuccessMessage(null);
        setValidationError(error.message);
      },
    }
  );

  useEffect(() => {
    // Validate username on type
    if (newUsername.length > 0) {
      if (!/^[a-zA-Z0-9_]{1,32}$/.test(newUsername)) {
        setValidationError(
          "Username must be 1-32 characters long and contain only letters, numbers, and underscores"
        );
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  }, [newUsername]);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (isEditing) {
      setNewUsername("");
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMessage(null);
    setValidationError(null);
    if (newUsername) {
      updateUsername();
    }
  };

  const navigate = useNavigate();
  const location = useLocation();
  const activeTab =
    location.pathname === "/profile/inbox" ? "inbox" : "settings";
  const unreadInboxCount =
    inboxSummary?.data.reduce(
      (total, conversation) => total + (conversation.unreadCount || 0),
      0
    ) || 0;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error);
    } else {
      navigate("/login"); // Redirect to login page after logout
    }
  };

  if (isUserLoading) return <LoadingSpinner />;
  if (userError) {
    return <ErrorDisplay message={userError?.message || "Unknown error"} />;
  }

  const coinBalance = walletData?.data.coinBalance || 0;

  return (
    <AnimatedPage className="home-background relative flex items-start justify-center px-4 py-6 md:py-10">
      <div className="home-gradient"></div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="relative z-10 flex h-full w-full max-w-6xl flex-col gap-5 rounded-xl bg-gray-950 p-5 shadow-2xl sm:p-6 md:mb-[100px]"
      >
        <div className="flex flex-col gap-4 border-b border-red-950/70 pb-5 md:flex-row md:items-center md:justify-between">
          <h2 className="text-center text-3xl font-extrabold text-red-500 md:text-left">
            Profile
          </h2>

          <div className="grid w-full grid-cols-2 rounded border border-red-950 bg-black/50 p-1 md:max-w-md">
            <Link
              to="/profile"
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded px-3 py-2 text-base transition sm:text-lg ${
                activeTab === "settings"
                  ? "bg-red-700 text-white"
                  : "text-gray-300 hover:bg-red-950/50 hover:text-white"
              }`}
            >
              <FaCog />
              Settings
            </Link>
            <Link
              to="/profile/inbox"
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded px-3 py-2 text-base transition sm:text-lg ${
                activeTab === "inbox"
                  ? "bg-red-700 text-white"
                  : "text-gray-300 hover:bg-red-950/50 hover:text-white"
              }`}
            >
              <FaEnvelope />
              Inbox
              {unreadInboxCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">
                  +{unreadInboxCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {activeTab === "inbox" ? (
          <InboxContent embedded />
        ) : (
          <>
            <div className="grid gap-4 border-b border-red-950/70 pb-5 md:grid-cols-2">
              <div className="flex min-h-24 flex-col justify-center gap-2 rounded border border-red-950/70 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-lg text-gray-300">Username</p>
                {isEditing ? (
                  <form
                    onSubmit={handleSubmit}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="min-w-0 rounded bg-gray-800 px-2 py-1 text-white"
                      placeholder={userData?.data?.username}
                      maxLength={32}
                    />
                    <button
                      type="submit"
                      disabled={
                        !!validationError || !newUsername || isUpdatingUsername
                      }
                      className="text-green-500 hover:text-green-400 disabled:text-gray-500"
                    >
                      <FaCheck />
                    </button>
                    <button
                      type="button"
                      onClick={handleEditToggle}
                      className="text-red-500 hover:text-red-400"
                    >
                      <FaTimes />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold text-red-500">
                      {userData?.data?.username}
                    </p>
                    <button
                      onClick={handleEditToggle}
                      className="text-blue-500 hover:text-blue-400"
                    >
                      <FaEdit />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex min-h-24 items-center justify-between gap-4 rounded border border-amber-500/60 bg-amber-950/30 px-4 py-3 text-amber-100">
                <div className="flex items-center gap-3">
                  <FaCoins className="text-2xl text-amber-300" />
                  <span className="text-lg text-amber-200">Coins</span>
                </div>
                <div className="text-2xl font-bold text-amber-300">
                  {isWalletLoading
                    ? "..."
                    : walletError
                      ? "Unavailable"
                      : coinBalance.toLocaleString()}
                </div>
              </div>

              {(validationError || successMessage) && (
                <div className="md:col-span-2">
                  {validationError && (
                    <div className="text-center text-lg text-red-500">
                      {validationError}
                    </div>
                  )}
                  {successMessage && (
                    <div className="animate-pulse text-center text-lg text-green-400">
                      {successMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            <AvatarEditor />

            <div className="flex justify-center">
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-300"
              >
                <FaSignOutAlt />
                <span>Logout</span>
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatedPage>
  );
};

export default Profile;
