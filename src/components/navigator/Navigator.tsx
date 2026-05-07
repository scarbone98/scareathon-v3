import { Link, useLocation } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { useNavigatorContext } from "./context";
import { navItems } from "./navItems";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";

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
  }, []);

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

  function getColor(item: { path: string }) {
    return (location.pathname.startsWith(item.path) && item.path !== "/") ||
      (item.path === "/" && location.pathname === "/")
      ? `${selectedItem?.color || "white"}`
      : "#374151";
  }

  const selectedItem = navItems.find(
    (item) =>
      (location.pathname.startsWith(item.path) && item.path !== "/") ||
      (item.path === "/" && location.pathname === "/")
  );
  const unreadInboxCount =
    inboxSummary?.data.reduce(
      (total, conversation) => total + (conversation.unreadCount || 0),
      0
    ) || 0;

  const renderNavLabel = (item: { name: string }) => (
    <>
      <span>{item.name}</span>
      {item.name === "Profile" && unreadInboxCount > 0 && (
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold leading-none text-black">
          +{unreadInboxCount}
        </span>
      )}
    </>
  );

  return (
    <nav className="font-zombie">
      {/* Desktop Navigation */}
      <div
        ref={navRef}
        className="hidden md:block bg-transparent z-50 absolute top-0 left-0 w-full"
      >
        <ul className="flex justify-around py-4">
          {navItems.map((item) => (
            <li key={item.name}>
              <Link
                to={item.path}
                className="inline-flex items-center gap-2 rounded px-4 py-2 text-4xl tracking-wide hover:bg-gray-100"
                style={{
                  color: getColor(item),
                }}
              >
                {renderNavLabel(item)}
              </Link>
            </li>
          ))}
        </ul>
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
              {navItems.map((item) => (
                <motion.li
                  key={item.name}
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
