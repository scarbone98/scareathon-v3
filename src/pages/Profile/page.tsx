import "../../styles/profile.css";
import { useState, useEffect, lazy, Suspense } from "react";
import { m as motion } from "framer-motion";
import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { fetchWithAuth } from "../../fetchWithAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FaCheck,
  FaArrowRight,
  FaGhost,
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
import { siteContainerClassName } from "../../components/PageContainer";
import { AvatarPreview } from "../../components/avatar/AvatarPreview";
import type { AvatarItem, AvatarResponse } from "../../components/avatar/types";
import { useInboxUnreadCount } from "../Inbox/useInboxUnreadCount";
const AvatarEditor = lazy(() => import("../../components/avatar/AvatarEditor").then(module => ({ default: module.AvatarEditor })));
const AvatarShop = lazy(() => import("../../components/avatar/AvatarShop").then(module => ({ default: module.AvatarShop })));
const InboxContent = lazy(() => import("../Inbox/page").then(module => ({ default: module.InboxContent })));

type WalletData = {
  data: {
    coinBalance: number;
    updatedAt?: string;
  };
};


const Profile = () => {
  const queryClient = useQueryClient();
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
    queryFn: () => fetchWithAuth("/user").then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load profile");
      return data;
    }),
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
        queryClient.setQueryData(["user"], data);
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
    if (!isEditing) setNewUsername(userData?.data?.username || "");
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
      : location.pathname.endsWith("/settings")
        ? "settings"
        : "avatar";
  const unreadInboxCount = useInboxUnreadCount();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error);
    } else {
      navigate("/authentication");
    }
  };

  if (isUserLoading) return <LoadingSpinner />;
  if (userError) {
    return <ErrorDisplay message={userError?.message || "Unknown error"} />;
  }

  const coinBalance = walletData?.data.coinBalance || 0;
  const equippedAvatarLayers = avatarResponse?.data.equipped || [];
  const visibleAvatarLayers = avatarPreviewLayers || equippedAvatarLayers;
  const avatarPreviewLabel =
    activeTab === "avatar" && avatarPreviewLayers
      ? "Live Preview"
      : activeTab === "shop" && avatarPreviewLayers
        ? "Marketplace Preview"
        : "Current Profile";
  const profileTabs = [
    { to: "/profile/avatar", key: "avatar", label: "Dress up", icon: <FaUserAlt /> },
    { to: "/profile/shop", key: "shop", label: "Item shop", icon: <FaShoppingBag /> },
    { to: "/profile/inbox", key: "inbox", label: "Inbox", icon: <FaEnvelope /> },
    { to: "/profile/settings", key: "settings", label: "Settings", icon: <FaCog /> },
  ];

  const sectionDetails = {
    avatar: { title: "Your wardrobe", description: "A little strange. Entirely you. Pick a category and try something on." },
    shop: { title: "Find your next favorite", description: "Discover new pieces and give your character a little more personality." },
    inbox: { title: "Your inbox", description: "Keep in touch with the creatures you meet along the way." },
    settings: { title: "Account settings", description: "Make yourself at home. Manage your name and account here." },
  }[activeTab];

  return (
    <AnimatedPage className="profile-world home-background">
      <div className="home-gradient" />
      <div className={`${siteContainerClassName} profile-container`}>
        <header className="profile-heading">
          <div>
            <p className="profile-eyebrow"><FaGhost aria-hidden="true" /> YOUR LITTLE CORNER OF SCAREATHON</p>
            <h1>My haunt<span>.</span></h1>
            <p>Dress up, hang out, and make a little mischief.</p>
          </div>
          <Link className="profile-community-link" to="/arcade">Visit the arcade <FaArrowRight /></Link>
        </header>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="profile-layout">
          <aside className="profile-sidebar">
            <div className="character-card">
              <div className="character-card-heading"><span>MY CHARACTER</span><FaGhost aria-hidden="true" /></div>
              <div className="character-stage">
                <div className="character-moon" aria-hidden="true" />
                {isAvatarLoading ? <div className="character-loading" role="status">Getting dressed…</div> : <AvatarPreview layers={visibleAvatarLayers} />}
                <span className="character-preview-label">{avatarPreviewLabel}</span>
              </div>
              <div className="character-identity">
                <h2>{userData?.data?.username || "Fellow creature"}</h2>
                <p>Your one-of-a-kind alter ego</p>
              </div>
              <div className="character-wallet">
                <span className="coin-icon"><FaCoins /></span>
                <div><span className="wallet-caption">Your coins</span><strong>{isWalletLoading ? "…" : walletError ? "Unavailable" : coinBalance.toLocaleString()}</strong></div>
                <Link to="/profile/shop" aria-label="Spend coins in the item shop"><FaArrowRight /></Link>
              </div>
            </div>
            <div className="profile-sidebar-note"><FaGhost aria-hidden="true" /><p>A new look, same you.<br /><span>Try on items before saving your outfit.</span></p></div>
          </aside>
          <section className="profile-panel">
            <nav className="profile-tabs" aria-label="Profile sections">
              {profileTabs.map((tab) => <Link key={tab.key} to={tab.to} aria-current={activeTab === tab.key ? "page" : undefined} className={`profile-tab ${activeTab === tab.key ? "is-active" : ""}`}>
                {tab.icon}<span>{tab.label}</span>{tab.key === "inbox" && unreadInboxCount > 0 && <span className="unread-badge">{unreadInboxCount}</span>}
              </Link>)}
            </nav>
            <div className="profile-panel-body">
              <header className="profile-section-heading"><h2>{sectionDetails.title}</h2><p>{sectionDetails.description}</p></header>
              <Suspense fallback={<div className="py-10 text-center text-sm text-purple-200" role="status">Loading {activeTab === "avatar" ? "wardrobe" : activeTab}…</div>}>
              {activeTab === "inbox" ? <InboxContent /> : activeTab === "shop" ? <AvatarShop onPreviewLayersChange={setAvatarPreviewLayers} /> : activeTab === "avatar" ? <AvatarEditor onPreviewLayersChange={setAvatarPreviewLayers} /> : (
                <div className="account-settings">
                  <section className="account-section">
                    <div className="account-section-icon"><FaUserAlt /></div>
                    <div className="account-section-content">
                      <h3>Your name around here</h3><p>This is how other members will see you.</p>
                      {isEditing ? <form onSubmit={handleSubmit} className="username-form">
                        <label htmlFor="profile-username">Username</label>
                        <input id="profile-username" autoFocus type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} maxLength={32} aria-invalid={!!validationError} aria-describedby={validationError ? "username-error" : undefined} />
                        <div className="profile-button-row"><button type="submit" className="profile-primary-button" disabled={!!validationError || !newUsername || isUpdatingUsername}><FaCheck />{isUpdatingUsername ? "Saving…" : "Save name"}</button><button type="button" onClick={handleEditToggle} className="profile-secondary-button"><FaTimes /> Cancel</button></div>
                      </form> : <div className="username-display"><strong>{userData?.data?.username}</strong><button onClick={handleEditToggle} className="profile-secondary-button"><FaEdit /> Edit name</button></div>}
                      {validationError && <p id="username-error" role="alert" className="profile-error">{validationError}</p>}
                      {successMessage && <p role="status" className="profile-success">{successMessage}</p>}
                    </div>
                  </section>
                  <section className="account-section"><div className="account-section-icon"><FaSignOutAlt /></div><div className="account-section-content"><h3>Heading out?</h3><p>Your character will be here when you get back.</p><button onClick={handleLogout} className="profile-secondary-button"><FaSignOutAlt /> Sign out</button></div></section>
                </div>
              )}
              </Suspense>
            </div>
          </section>
        </motion.div>
      </div>
    </AnimatedPage>
  );
};

export default Profile;
