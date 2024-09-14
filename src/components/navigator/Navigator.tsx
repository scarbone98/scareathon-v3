import { Link, useLocation } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { useNavigatorContext } from "./context";
import { navItems } from "./navItems";

export const Navigator = () => {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const { setHeight } = useNavigatorContext();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (navRef.current) {
      setHeight(navRef.current.offsetHeight);
    }

    return () => {
      setHeight(0);
    };
  }, []);

  return (
    <nav
      className="fixed bottom-4 left-4 z-50"
      ref={navRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-200 text-gray-700 p-3 rounded-full shadow-md hover:bg-gray-300 focus:outline-none"
      >
        ☰
      </button>
      {isOpen && (
        <ul className="absolute bottom-full left-0 mb-2 w-48 bg-white shadow-md rounded-lg overflow-hidden">
          {navItems.map((item, index) => (
            <li
              key={item.name}
              data-index={index}
              className={`${
                item.path === location.pathname ? "bg-gray-100" : ""
              }`}
            >
              <Link 
                to={item.path} 
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  item.path === location.pathname ? "text-red-500" : "text-gray-700"
                } hover:bg-gray-100`}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
};
