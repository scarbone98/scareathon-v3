// Colors, sprite sheets and helpers shared by the Crypt Clash screens.
import { useEffect, useState, type RefObject } from "react";
import { getCard, type CardSprite } from "../../../../server/shared/royale/index.js";

export const ORANGE = "#ff8a1f";
export const PURPLE = "#b061ff";

const sheet = (url: string, frameWidth: number, frameHeight: number, frames = 1): CardSprite => ({ url, frameWidth, frameHeight, frames, height: 1 });
export const SPRITES = {
  joe: sheet("/royale/joe_idle.png", 16, 24, 6),
  matt: sheet("/royale/matt_idle.png", 16, 24, 6),
  alex: sheet("/royale/ui/alex_idle.png", 16, 24, 6),
  jon: sheet("/royale/ui/jon_idle.png", 16, 24, 5),
  skull: sheet("/sprites/skullsprite.png", 24, 18, 6),
  lamp: sheet("/royale/ui/lamp.png", 16, 64, 4),
  tree: sheet("/royale/ui/tree.png", 128, 128),
  grave: sheet("/royale/ui/grave.png", 32, 32),
  mausoleum: sheet("/royale/ui/mausoleum.png", 80, 116),
  chest: sheet("/royale/ui/chest.png", 32, 32),
  trophy: sheet("/royale/ui/trophy.png", 16, 16),
  heart: sheet("/royale/ui/heart.png", 16, 16),
  basket: sheet("/royale/ui/candybasket.png", 32, 32),
  shadow: sheet("/royale/ui/shadow.png", 16, 16),
};

export function avgCost(cards: string[]) {
  return cards.reduce((sum, id) => sum + getCard(id).cost, 0) / cards.length;
}

// How much to scale a screen's art and controls up on tall displays: 1 at
// phone height (about 860px), up to 1.6.
export function useScreenScale(ref: RefObject<HTMLElement>) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1.6, Math.max(1, el.clientHeight / 860))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}
