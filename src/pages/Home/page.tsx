import AnimatedPage from "../../components/AnimatedPage";
import Countdown from "./Countdown";
import CurrentMovie from "./CurrentMovie";
import { useState, useEffect } from "react";
import { calculateTimeLeft } from "./calculateTimeLeft";

export default function Home() {
  const [timeLeft, setTimeLeft] = useState(
    calculateTimeLeft(new Date("2024-10-01"))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(new Date("2024-10-01")));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <AnimatedPage
      style={{
        paddingTop: 0,
      }}
      className="flex flex-col items-center justify-center h-screen bg-cover bg-center home-background"
    >
      <div className="home-gradient" />
      <div className="text-center">
        {timeLeft.difference <= 0 ? (
          <Countdown timeLeft={timeLeft} />
        ) : (
          <CurrentMovie />
        )}
      </div>
    </AnimatedPage>
  );
}
