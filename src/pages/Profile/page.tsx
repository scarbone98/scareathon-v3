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
  FaShoppingBag,
  FaSignOutAlt,
  FaTimes,
  FaUserAlt,
} from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient"; // Make sure this import is correct
import { AvatarEditor } from "../../components/avatar/AvatarEditor";
import { AvatarPreview } from "../../components/avatar/AvatarPreview";
import { AvatarShop } from "../../components/avatar/AvatarShop";
import type { AvatarItem, AvatarResponse } from "../../components/avatar/types";
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
  const [avatarPreviewLayers, setAvatarPreviewLayers] = useState<
    AvatarItem[] | null
  >(null);

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

  const { data: avatarResponse, isLoading: isAvatarLoading } =
    useQuery<AvatarResponse>({
      queryKey: ["avatar"],
      queryFn: () =>
        fetchWithAuth("/user/avatar").then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Failed to load avatar");
          }
          return data;
        }),
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
  const activeTab = location.pathname.endsWith("/inbox")
    ? "inbox"
    : location.pathname.endsWith("/shop")
      ? "shop"
    : location.pathname.endsWith("/avatar")
      ? "avatar"
      : "settings";
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
  const equippedAvatarLayers = avatarResponse?.data.equipped || [];
  const visibleAvatarLayers =
    activeTab === "avatar" && avatarPreviewLayers
      ? avatarPreviewLayers
      : equippedAvatarLayers;
  const profileTabs = [
    { to: "/profile/avatar", key: "avatar", label: "Avatar", icon: <FaUserAlt /> },
    { to: "/profile/shop", key: "shop", label: "Shop", icon: <FaShoppingBag /> },
    { to: "/profile/inbox", key: "inbox", label: "Inbox", icon: <FaEnvelope /> },
    { to: "/profile", key: "settings", label: "Settings", icon: <FaCog /> },
  ];

  return (
    <AnimatedPage className="home-background relative flex items-start justify-center px-4 py-6 md:py-10">
      <div className="home-gradient"></div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="relative z-10 grid h-full w-full max-w-7xl gap-5 rounded-xl bg-gray-950 p-4 shadow-2xl sm:p-5 md:mb-[100px] lg:max-h-[calc(100vh-7rem)] lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)]"
      >
        <aside className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="rounded border border-red-950/70 bg-black/30 p-4">
            <div className="flex flex-col items-center gap-4">
              {isAvatarLoading ? (
                <div className="flex h-64 w-64 items-center justify-center rounded border border-red-900/60 bg-black/60">
                  <LoadingSpinner />
                </div>
              ) : (
                <AvatarPreview layers={visibleAvatarLayers} />
              )}
              <div className="w-full min-w-0 text-center">
                <p className="text-sm uppercase tracking-widest text-gray-400">
                  {activeTab === "avatar" ? "Live Preview" : "Current Profile"}
                </p>
                <h1 className="truncate text-3xl font-bold text-red-500">
                  {userData?.data?.username}
                </h1>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded border border-red-950/70 bg-black/30 p-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-amber-200">
                <FaCoins className="text-xl text-amber-300" />
                <span>Coins</span>
              </div>
              <span className="font-bold text-amber-300">
                {isWalletLoading
                  ? "..."
                  : walletError
                    ? "Unavailable"
                    : coinBalance.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-gray-300">
                <FaEnvelope className="text-xl text-red-400" />
                <span>Unread</span>
              </div>
              <span className="font-bold text-red-200">{unreadInboxCount}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-gray-300">
                <FaUserAlt className="text-xl text-red-400" />
                <span>Loadout</span>
              </div>
              <span className="font-bold text-red-200">
                {equippedAvatarLayers.length}
              </span>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-5 lg:min-h-0">
          <div className="grid grid-cols-2 rounded border border-red-950 bg-black/50 p-1 md:grid-cols-4">
            {profileTabs.map((tab) => (
              <Link
                key={tab.key}
                to={tab.to}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded px-3 py-2 text-base transition sm:text-lg ${
                  activeTab === tab.key
                    ? "bg-red-700 text-white"
                    : "text-gray-300 hover:bg-red-950/50 hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "inbox" && unreadInboxCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">
                    +{unreadInboxCount}
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {activeTab === "inbox" ? (
              <InboxContent embedded />
            ) : activeTab === "shop" ? (
              <AvatarShop />
            ) : activeTab === "avatar" ? (
              <AvatarEditor onPreviewLayersChange={setAvatarPreviewLayers} />
            ) : (
              <div className="grid gap-5">
                <div className="rounded border border-red-950/70 bg-black/30 p-4">
                  <div className="mb-4 flex items-center gap-3 text-amber-200">
                    <FaCog className="text-2xl text-red-400" />
                    <h2 className="text-2xl text-red-200">Account Settings</h2>
                  </div>

                  <div className="flex min-h-24 flex-col justify-center gap-3 rounded border border-red-950/70 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-lg text-gray-300">Username</p>
                    {isEditing ? (
                      <form
                        onSubmit={handleSubmit}
                        className="flex flex-wrap items-center gap-2 sm:justify-end"
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
                      <div className="flex min-w-0 items-center gap-3">
                        <p className="truncate text-2xl font-bold text-red-500">
                          {userData?.data?.username}
                        </p>
                        <button
                          onClick={handleEditToggle}
                          className="shrink-0 text-blue-500 hover:text-blue-400"
                        >
                          <FaEdit />
                        </button>
                      </div>
                    )}
                  </div>

                  {(validationError || successMessage) && (
                    <div className="mt-4">
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

                  <div className="mt-5 border-t border-red-950/70 pt-4">
                    <button
                      onClick={handleLogout}
                      className="flex min-h-11 items-center justify-center gap-2 rounded bg-red-600 px-4 py-2 font-bold text-white transition duration-300 hover:bg-red-700"
                    >
                      <FaSignOutAlt />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </motion.div>
    </AnimatedPage>
  );
};

export default Profile;
