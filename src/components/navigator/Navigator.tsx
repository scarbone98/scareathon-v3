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
      className="flex justify-between items-center p-4 w-full absolute top-0"
      ref={navRef}
    >
      <ul className="flex gap-10 w-full justify-center">
        {navItems.map((item, index) => (
          <li
            key={item.name}
            data-index={index}
            className={`${
              item.path === location.pathname ? "text-red-500" : "text-gray-500"
            } text-xl`}
          >
            <Link to={item.path}>{item.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
