import { motion } from "framer-motion";

export default function AnimatedPage({
  children,
  style,
  onAnimationStart,
  onAnimationComplete,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}) {
  return (
    <motion.div
      style={{ ...style }}
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
