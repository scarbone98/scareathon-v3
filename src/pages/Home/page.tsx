import AnimatedPage from "../../components/AnimatedPage";
import Countdown from "./Countdown";
import CurrentMovie from "./CurrentMovie";
import { useState, useEffect, useMemo } from "react";
import { calculateTimeLeft } from "./calculateTimeLeft";

export default function Home() {
  const endDate = useMemo(() => {
    // Set the end date to October 1, 2024, at midnight EST
    return new Date("2024-10-01T00:00:00-05:00");
  }, []);

  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(endDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(endDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate]);

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
