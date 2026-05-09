import { Link, useLocation } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { useNavigatorContext } from "./context";
import { mobileNavItems, navItems, profileNavItem } from "./navItems";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { getAvatarCompositePublicUrl } from "../avatar/avatarComposite";

type InboxSummary = {
  data: Array<{
    unreadCount?: number;
  }>;
};

export const Navigator = () => {
  const location = useLocation();

  const navRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  const { setHeight } = useNavigatorContext();
  const [isOpen, setIsOpen] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);

  const { data: inboxSummary } = useQuery<InboxSummary>({
    queryKey: ["inbox", "conversations"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return { data: [] };
      }

      const response = await fetchWithAuth("/inbox/conversations?limit=25");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load inbox");
      }
      return data;
    },
    staleTime: 1000 * 30,
  });

  const { data: avatarCompositeUrl } = useQuery<string | null>({
    queryKey: ["avatar", "compositeUrl"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return null;
      }

      return getAvatarCompositePublicUrl(session.user.id, Date.now());
    },
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [avatarCompositeUrl]);

  useEffect(() => {
    const updateHeight = () => {
      if (navRef.current) {
        setHeight(navRef.current.offsetHeight);
      }
    };

    updateHeight(); // Initial height set

    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      setHeight(0);
    };
  }, [setHeight]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target as Node) &&
        isOpen
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, mobileNavRef.current?.offsetHeight]);

  function getColor(item: { path: string; color?: string }) {
    return (location.pathname.startsWith(item.path) && item.path !== "/") ||
      (item.path === "/" && location.pathname === "/")
      ? `${item.color || selectedItem?.color || "white"}`
      : "#374151";
  }

  const allNavItems = [...navItems, profileNavItem];
  const selectedItem = allNavItems.find(
    (item) =>
      (location.pathname.startsWith(item.path) && item.path !== "/") ||
      (item.path === "/" && location.pathname === "/")
  );
  const unreadInboxCount =
    inboxSummary?.data.reduce(
      (total, conversation) => total + (conversation.unreadCount || 0),
      0
    ) || 0;

  const renderProfileLabel = () => (
    <>
      {avatarCompositeUrl && !avatarImageFailed ? (
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-red-900 bg-black/70 xl:h-12 xl:w-12">
          <img
            src={avatarCompositeUrl}
            alt="Profile"
            className="h-full w-full rounded-full object-contain"
            draggable={false}
            style={{ imageRendering: "pixelated" }}
            onError={() => setAvatarImageFailed(true)}
          />
        </span>
      ) : (
        <span>Profile</span>
      )}
      {unreadInboxCount > 0 && (
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold leading-none text-black">
          +{unreadInboxCount}
        </span>
      )}
    </>
  );

  const renderNavLabel = (item: { name: string }) => (
    <>
      {item.name === "Profile" ? renderProfileLabel() : <span>{item.name}</span>}
    </>
  );

  return (
    <nav className="font-zombie">
      {/* Desktop Navigation */}
      <div
        ref={navRef}
        className="hidden md:block bg-transparent z-50 absolute top-0 left-0 w-full"
      >
        <div className="flex items-center justify-between px-8 py-3 xl:px-10">
          <ul className="flex items-center gap-7 xl:gap-10">
            {navItems.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className="inline-flex items-center gap-2 rounded px-3 py-2 text-3xl leading-none tracking-wide hover:bg-gray-100"
                  style={{
                    color: getColor(item),
                  }}
                >
                  {renderNavLabel(item)}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex items-center">
            <li key={profileNavItem.name}>
              <Link
                to={profileNavItem.path}
                className="inline-flex items-center gap-2 rounded px-3 py-2 text-3xl leading-none tracking-wide hover:bg-gray-100"
                style={{
                  color: getColor(profileNavItem),
                }}
              >
                {renderNavLabel(profileNavItem)}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-4 left-4 z-50" ref={mobileNavRef}>
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-transparent p-0 focus:outline-none relative"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          aria-label="Toggle mobile menu"
        >
          <div
            className={`w-16 h-16 relative ${
              isOpen ? "opacity-100" : "opacity-50"
            }`}
          >
            <div className="absolute inset-0 bg-red-500 filter blur-md animate-pulse"></div>
            <img
              src="/images/candleskull.gif"
              alt="Menu"
              className="w-full h-full object-cover relative z-10"
            />
            <div className="absolute inset-0 border-4 border-red-500 irregular-border"></div>
          </div>
        </motion.button>
        <AnimatePresence>
          {isOpen && (
            <motion.ul
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-full left-0 mb-2 w-56 bg-black bg-opacity-95 shadow-lg rounded-lg overflow-hidden border"
              style={{
                borderColor: selectedItem?.color || "red-500",
              }}
            >
              {mobileNavItems.map((item) => (
                <motion.li
                  key={item.name}
                  className={
                    "group" in item && item.group === "account"
                      ? "border-t border-red-950/70"
                      : undefined
                  }
                  whileHover={{ backgroundColor: "rgba(255, 0, 0, 0.2)" }}
                >
                  <Link
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-3xl tracking-[0.15em] transition-colors duration-200 hover:text-white"
                    style={{
                      color: getColor(item),
                    }}
                  >
                    {renderNavLabel(item)}
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};
