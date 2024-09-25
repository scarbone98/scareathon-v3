export const PageContainer = ({ children }: { children: React.ReactNode }) => {
  return <main className="flex flex-col overflow-x-hidden">{children}</main>;
};
