import { motion } from "framer-motion";

const numberVariants = {
  hidden: { y: -20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

interface CountdownProps {
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

export default function Countdown({ timeLeft }: CountdownProps) {
  return (
    <>
      <h1 className="text-5xl md:text-5xl font-bold mb-4 text-blood-red font-spooky">
        Scareathon 2024
      </h1>
      <div className="text-sm md:text-2xl flex space-x-4 justify-center font-eerie">
        {Object.entries(timeLeft)
          .filter(([unit]) => unit !== "difference")
          .map(([unit, value]) => (
            <div key={unit} className="flex flex-col items-center">
              <motion.div
                variants={numberVariants}
                initial="hidden"
                animate="visible"
                transition={{ type: "spring", stiffness: 100 }}
                key={value}
                className="text-blood-red"
              >
                {value}
              </motion.div>
              <div className="text-blood-red">{unit}</div>
            </div>
          ))}
      </div>
    </>
  );
}
