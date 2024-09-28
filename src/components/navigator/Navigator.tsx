import { Link, useLocation } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { useNavigatorContext } from "./context";
import { navItems } from "./navItems";
import { motion, AnimatePresence } from "framer-motion";

export const Navigator = () => {
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const { setHeight } = useNavigatorContext();
  const [isOpen, setIsOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (navRef.current) {
      setHeight(navRef.current.offsetHeight);
    }

    return () => {
      setHeight(0);
    };
  }, [navRef.current?.offsetHeight]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target as Node) && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, mobileNavRef.current?.offsetHeight]);

  return (
    <nav>
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
                className={`px-4 py-2 text-xl ${
                  item.path === location.pathname
                    ? "text-red-500"
                    : "text-gray-700"
                } hover:bg-gray-100 rounded`}
              >
                {item.name}
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
          <div className={`w-16 h-16 relative ${isOpen ? 'opacity-100' : 'opacity-50'}`}>
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
              className="absolute bottom-full left-0 mb-2 w-56 bg-black bg-opacity-95 shadow-lg rounded-lg overflow-hidden border border-red-500"
            >
              {navItems.map((item) => (
                <motion.li
                  key={item.name}
                  whileHover={{ backgroundColor: "rgba(255, 0, 0, 0.2)" }}
                >
                  <Link
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={`block px-4 py-3 text-sm ${
                      item.path === location.pathname
                        ? "text-red-500"
                        : "text-gray-300"
                    } hover:text-white transition-colors duration-200`}
                  >
                    {item.name}
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
