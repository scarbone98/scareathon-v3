import AnimatedPage from "../../components/AnimatedPage";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function Home() {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearTimeout(timer);
  });

  function calculateTimeLeft(): {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } {
    const difference = +new Date("2024-10-01") - +new Date();
    let timeLeft = {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };

    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    }

    return timeLeft;
  }

  const numberVariants = {
    hidden: { y: -20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <AnimatedPage style={{ overflow: "hidden" }}>
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-5xl font-bold mb-4">Scareathon 2024</h1>
        <div className="text-2xl flex space-x-4">
          {Object.entries(timeLeft).map(([unit, value]) => (
            <div key={unit} className="flex flex-col items-center">
              <motion.div
                variants={numberVariants}
                initial="hidden"
                animate="visible"
                transition={{ type: "spring", stiffness: 100 }}
                key={value}
              >
                {value}
              </motion.div>
              <div>{unit}</div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}
