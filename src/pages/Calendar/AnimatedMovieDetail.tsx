import React, { useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface MovieDetailProps {
  day: any; // Replace 'any' with a proper type for your day object
  onClose: () => void;
  initialPosition: { top: number; left: number; width: number; height: number };
}

const AnimatedMovieDetail: React.FC<MovieDetailProps> = ({
  day,
  onClose,
  initialPosition,
}) => {
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        detailRef.current &&
        !detailRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={detailRef}
      initial={initialPosition}
      exit={initialPosition}
      animate={{
        top: "50%",
        left: "50%",
        width: "25vw",
        height: "fit-content",
        x: "-50%",
        y: "-50%",
        overflow: "hidden", // Add this line to prevent scroll bars during animation
      }}
      transition={{
        type: "spring",
        damping: 15,
        stiffness: 60,
        duration: 0.3,
      }}
      className="fixed bg-orange-50 rounded-lg shadow-xl border border-orange-300 p-6 overflow-auto z-25"
    >
      <h2 className="text-2xl font-bold text-orange-800 mb-4">{day.title}</h2>
      <img
        src={day.lowResUrl}
        alt={day.title}
        className="w-full aspect-square object-cover rounded-lg mb-4"
      />
    </motion.div>
  );
};

export default AnimatedMovieDetail;
