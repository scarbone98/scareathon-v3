import type { ElementType, ReactNode } from "react";

export const siteContainerClassName =
  "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export const PageContainer = ({ children }: { children: ReactNode }) => {
  return <main className="flex flex-col overflow-x-hidden">{children}</main>;
};

export const SiteContainer = ({
  as: Component = "div",
  children,
  className = "",
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
}) => {
  return (
    <Component
      className={`${siteContainerClassName}${className ? ` ${className}` : ""}`}
    >
      {children}
    </Component>
  );
};
