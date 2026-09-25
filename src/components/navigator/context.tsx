import { createContext, useContext, useState } from "react";

interface NavigatorContextType {
  height: number;
  setHeight: (height: number) => void;
  // True while something full-screen (like an arcade game) needs the phone
  // menu button out of the way
  hideMobileNav: boolean;
  setHideMobileNav: (hide: boolean) => void;
}

const NavigatorContext = createContext<NavigatorContextType | undefined>(
  undefined
);

export const useNavigatorContext = () => {
  const context = useContext(NavigatorContext);
  if (!context) {
    throw new Error(
      "useNavigatorContext must be used within a NavigatorProvider"
    );
  }
  return context;
};

export const NavigatorProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [height, setHeight] = useState(0);
  const [hideMobileNav, setHideMobileNav] = useState(false);
  return (
    <NavigatorContext.Provider value={{ height, setHeight, hideMobileNav, setHideMobileNav }}>
      {children}
    </NavigatorContext.Provider>
  );
};
