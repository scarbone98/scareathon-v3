import { useEffect, useRef } from "react";

// Full-screen old-TV transition.
// "on": static swells in, the game mounts underneath (onMidpoint), the static
//   holds a while to cover the game's loading screen, then the channel tunes
//   in: the snow flickers away, torn bands linger and a dark bar rolls up the
//   screen until the picture locks.
// "off": the picture collapses to a line and a dot on black (onMidpoint, swap
//   what's underneath then), and the black lifts.
// onDone fires when the effect has finished.
//
// "on" is all CSS opacity and transform animation, which browsers run off the
// main thread: the game starting up underneath hogs that thread (on iPhones the
// game's frame shares it), and anything drawn from JavaScript would freeze.

type Props = {
  mode: "on" | "off";
  onMidpoint: () => void;
  onDone: () => void;
};

const STATIC_MS = 420;
const FADE_IN_MS = 90; // the static swells in from the cabinet's rather than cutting on
// Snow held over the game after it mounts, to hide its loading screen
const HOLD_MS = 2500;
const TUNE_MS = 900;
const TUNE_AT = STATIC_MS + HOLD_MS;
const LINE_MS = 250;
const LIFT_MS = 170;

// A still tile of noise; CSS jumps it about so it looks alive
let noiseTile: string | null = null;
function noiseTileUrl() {
  if (noiseTile) return noiseTile;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() * 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  noiseTile = canvas.toDataURL();
  return noiseTile;
}

// Uneven horizontal tears: which strips of snow linger while the channel tunes in
const TEARS =
  "linear-gradient(to bottom, #000 0 4%, transparent 4% 11%, #000 11% 13%, transparent 13% 27%, #000 27% 33%, " +
  "transparent 33% 46%, #000 46% 48%, transparent 48% 61%, #000 61% 69%, transparent 69% 78%, #000 78% 80%, " +
  "transparent 80% 91%, #000 91% 95%, transparent 95%)";

const CRT_STYLES = `
@keyframes crt-snow {
  0% { transform: translate(0, 0); }
  12.5% { transform: translate(-13%, 7%); }
  25% { transform: translate(9%, -11%); }
  37.5% { transform: translate(-6%, -17%); }
  50% { transform: translate(17%, 4%); }
  62.5% { transform: translate(-19%, 13%); }
  75% { transform: translate(5%, 19%); }
  87.5% { transform: translate(14%, -6%); }
}
@keyframes crt-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes crt-snow-out {
  0% { opacity: 1; } 18% { opacity: 0.55; } 26% { opacity: 0.85; } 42% { opacity: 0.3; }
  52% { opacity: 0.5; } 70% { opacity: 0.12; } 80% { opacity: 0.22; } 100% { opacity: 0; }
}
@keyframes crt-tears-out {
  0% { opacity: 1; } 30% { opacity: 0.9; } 55% { opacity: 0.6; } 75% { opacity: 0.35; } 100% { opacity: 0; }
}
@keyframes crt-tears-jump {
  0% { transform: translateY(0); } 20% { transform: translateY(9%); } 40% { transform: translateY(-6%); }
  60% { transform: translateY(14%); } 80% { transform: translateY(3%); }
}
@keyframes crt-roll {
  from { transform: translateY(420%); } to { transform: translateY(-120%); }
}
@keyframes crt-roll-out { from { opacity: 0.6; } to { opacity: 0; } }
.crt-snow {
  animation:
    crt-snow 0.36s steps(1) infinite,
    crt-in ${FADE_IN_MS}ms ease-out both,
    crt-snow-out ${TUNE_MS * 0.7}ms linear ${TUNE_AT}ms forwards;
}
.crt-tears {
  opacity: 0;
  -webkit-mask-image: ${TEARS};
  mask-image: ${TEARS};
  animation:
    crt-tears-jump 0.3s steps(1) infinite,
    crt-tears-out ${TUNE_MS}ms linear ${TUNE_AT}ms forwards;
}
.crt-roll {
  opacity: 0;
  animation:
    crt-roll ${TUNE_MS / 1.6}ms linear ${TUNE_AT}ms 2,
    crt-roll-out ${TUNE_MS}ms ease-in ${TUNE_AT}ms forwards;
}
`;

export default function CrtTransition({ mode, onMidpoint, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onMidpoint, onDone });
  callbacks.current = { onMidpoint, onDone };

  useEffect(() => {
    if (mode === "on") {
      // Only the swaps are timed from JavaScript; if the thread is busy they just
      // land a little late, while the picture keeps moving
      const midpoint = window.setTimeout(() => callbacks.current.onMidpoint(), STATIC_MS);
      const done = window.setTimeout(() => callbacks.current.onDone(), TUNE_AT + TUNE_MS);
      return () => {
        window.clearTimeout(midpoint);
        window.clearTimeout(done);
      };
    }

    const root = rootRef.current;
    const beam = beamRef.current;
    if (!root || !beam) return;
    const start = performance.now();
    let frame = 0;
    let midpointSent = false;
    const tick = () => {
      // The picture squeezes to a line, then a dot, then the black lifts
      const t = performance.now() - start;
      const k = Math.min(t / LINE_MS, 1);
      beam.style.transform = k < 0.7 ? `scaleY(${1 - k / 0.7})` : `scaleX(${1 - (k - 0.7) / 0.3})`;
      if (k >= 1 && !midpointSent) {
        midpointSent = true;
        callbacks.current.onMidpoint();
      }
      if (k >= 1) {
        const s = (t - LINE_MS) / LIFT_MS;
        root.style.opacity = String(Math.max(1 - s, 0));
        if (s >= 1) {
          callbacks.current.onDone();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const noise = { backgroundImage: `url(${noiseTileUrl()})`, backgroundSize: "384px 384px", imageRendering: "pixelated" as const };

  return (
    <div ref={rootRef} className="pointer-events-auto fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {mode === "on" ? (
        <>
          <style>{CRT_STYLES}</style>
          {/* Both snow layers are twice the screen's size so they cover as they jump about */}
          <div className="crt-tears absolute inset-[-50%]" style={noise} />
          <div className="crt-snow absolute inset-[-50%]" style={noise} />
          {/* The rolling vertical-hold bar */}
          <div className="crt-roll absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-black to-transparent" />
        </>
      ) : (
        // A frame of black around a shrinking white picture
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div ref={beamRef} className="h-full w-full origin-center bg-white/90" />
        </div>
      )}
    </div>
  );
}
