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
      style={{ paddingTop: height, ...style }}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onAnimationStart={onAnimationStart}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}
