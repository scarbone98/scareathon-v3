import { motion } from "framer-motion";
import { useNavigatorContext } from "./navigator/context";

export default function AnimatedPage({
  children,
  style,
  onAnimationStart,
  onAnimationComplete,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
  className?: string;
}) {
  const { height } = useNavigatorContext();
  return (
    <motion.div
      style={{ ...style, paddingTop: height }}
      className={className}
      initial={{ opacity: 0, x: window.innerWidth }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -window.innerWidth }}
      transition={{ duration: 0.5 }}
      onAnimationStart={onAnimationStart}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}
