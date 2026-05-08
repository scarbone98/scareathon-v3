import AnimatedPage from "../../components/AnimatedPage";
import CurrentMovie from "./CurrentMovie";
import { ProtectedRoute } from "../../components/AnimatedRoutes";
export default function Home() {
  return (
    <AnimatedPage
      className="flex flex-col items-center justify-center bg-cover bg-center home-background"
    >
      <div className="home-gradient" />
      <div className="text-center">
        <ProtectedRoute>
          <CurrentMovie />
        </ProtectedRoute>
      </div>
    </AnimatedPage>
  );
}
