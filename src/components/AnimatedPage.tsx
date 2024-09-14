import { motion } from "framer-motion";
import { useState } from "react";

export default function AnimatedPage({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  return (
    <motion.div
      style={{ overflow: isAnimating ? "hidden" : "auto", ...style }}
      initial={{ opacity: 0, x: window.innerWidth }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -window.innerWidth }}
      transition={{ duration: 0.5 }}
      onAnimationStart={() => setIsAnimating(true)}
      onAnimationComplete={() => setIsAnimating(false)}
    >
      {children}
    </motion.div>
  );
}
