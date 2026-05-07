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

  return (
    <AnimatedPage className="home-background flex justify-center items-center relative px-4">
      <div className="home-gradient"></div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`relative z-10 bg-gray-950 p-8 rounded-xl shadow-2xl max-w-5xl w-full h-full md:mb-[100px] flex flex-col gap-6`}
      >
        <h2 className="text-3xl font-extrabold text-center text-red-500">
          Profile
        </h2>

        <div className="mx-auto grid w-full max-w-md grid-cols-2 rounded border border-red-950 bg-black/50 p-1">
          <Link
            to="/profile"
            className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-lg transition ${
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
            className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-lg transition ${
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

        {activeTab === "inbox" ? (
          <InboxContent embedded />
        ) : (
          <>
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-4">
                <p className="text-xl text-gray-300">Username:</p>
                {isEditing ? (
                  <form
                    onSubmit={handleSubmit}
                    className="flex items-center space-x-2"
                  >
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="bg-gray-800 text-white px-2 py-1 rounded"
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
                  <>
                    <p className="text-2xl font-bold text-red-500">
                      {userData?.data?.username}
                    </p>
                    <button
                      onClick={handleEditToggle}
                      className="text-blue-500 hover:text-blue-400"
                    >
                      <FaEdit />
                    </button>
                  </>
                )}
              </div>
              {validationError && (
                <div className="text-red-500 text-lg">{validationError}</div>
              )}
              {successMessage && (
                <div className="text-green-400 text-lg animate-pulse">
                  {successMessage}
                </div>
              )}
            </div>

            <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-4 rounded border border-amber-500/60 bg-amber-950/30 px-5 py-4 text-amber-100 shadow-lg">
              <div className="flex items-center gap-3">
                <FaCoins className="text-2xl text-amber-300" />
                <span className="text-lg text-amber-200">Coins</span>
              </div>
              <div className="text-2xl font-bold text-amber-300">
                {isWalletLoading
                  ? "..."
                  : walletError
                    ? "Unavailable"
                    : (walletData?.data.coinBalance || 0).toLocaleString()}
              </div>
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
