import type { HeroAvatar } from "./game/avatar";
import type { HeroId } from "./game/sim";

export function HeroPortrait({ id, avatar, className = "" }: { id: HeroId; avatar: HeroAvatar | null; className?: string }) {
  return <span className={`wf-hero-face ${id === "you" ? "wf-you-face" : ""} ${className}`} aria-hidden="true"
    style={{ backgroundImage: `url(${id === "you" ? avatar?.portraitUrl ?? "" : `/mystery-crypt/portraits/${id}.png`})` }} />;
}
