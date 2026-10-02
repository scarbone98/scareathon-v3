import { useNavigatorContext } from "./navigator/context";

// A page, fading in as it arrives
export default function AnimatedPage({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const { height } = useNavigatorContext();
  return (
    <div
      style={{
        paddingTop: height,
        minHeight: 'var(--vh)',
        minWidth: '100vw',
        position: 'relative',
        ...style,
      }}
      className={`page-fade-in${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
