import { createContext, useContext, useState } from "react";

interface NavigatorContextType {
  height: number;
  setHeight: (height: number) => void;
}

export const NavigatorContext = createContext<NavigatorContextType | undefined>(
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
  return (
    <NavigatorContext.Provider value={{ height, setHeight }}>
      {children}
    </NavigatorContext.Provider>
  );
};
