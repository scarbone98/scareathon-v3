import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";

export default function Arcade() {
  return (
    <AnimatedPage style={{ overflow: "hidden" }}>
      <ArcadeGallery />
    </AnimatedPage>
  );
}
