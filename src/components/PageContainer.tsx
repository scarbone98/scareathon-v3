// import { useNavigatorContext } from "./navigator/context";

export const PageContainer = ({ children }: { children: React.ReactNode }) => {
  // const { height } = useNavigatorContext();
  return (
    <main className="flex flex-col overflow-x-hidden min-h-screen">
      {children}
    </main>
  );
};
