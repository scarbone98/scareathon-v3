import AnimatedPage from "../../components/AnimatedPage";
import CurrentMovie from "../Home/CurrentMovie";

export default function ScareathonToday() {
  return (
    <AnimatedPage className="flex flex-col items-center justify-center bg-cover bg-center home-background">
      <div className="home-gradient" />
      <div className="relative z-10 text-center">
        <CurrentMovie />
      </div>
    </AnimatedPage>
  );
}
