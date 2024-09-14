import { Link, useLocation } from "react-router-dom";
import { useRef, useEffect } from "react";
import { useNavigatorContext } from "./context";
import { navItems } from "./navItems";

export const Navigator = () => {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const { setHeight } = useNavigatorContext();

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
      className="flex justify-between items-center p-4 w-full absolute top-0 overflow-x-auto"
      ref={navRef}
    >
      <ul className="flex gap-4 sm:gap-10 w-full justify-start sm:justify-center">
        {navItems.map((item, index) => (
          <li
            key={item.name}
            data-index={index}
            className={`${
              item.path === location.pathname ? "text-red-500" : "text-gray-500"
            } text-sm sm:text-xl whitespace-nowrap`}
          >
            <Link to={item.path}>{item.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
