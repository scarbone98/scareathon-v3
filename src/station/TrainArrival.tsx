import { useEffect, useState } from "react";
import { pixel } from "./style/theme.ts";

// Coming into the station: you're in a train car, facing its doors. Lights streak past the
// door windows and slow as it pulls in; it waits there till the station's loaded (the
// real platform shows through the windows); then the doors slide open and you step off.

type Phase = "arriving" | "stopped" | "opening" | "stepping";

const ARRIVE = 2300; // ms of braking before it can stop
const OPEN = 850;
const STEP = 700;
const MAX_WAIT = 7000; // don't hold anyone on the train forever

const PANEL = "#2c2f35";
const PANEL_DARK = "#1c1e22";
const WALL = "#3a2a20";

export default function TrainArrival({
  ready,
  onDone,
}: {
  ready: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("arriving");
  const [braked, setBraked] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const stop = window.setTimeout(
      () => setBraked(true),
      reduced ? 300 : ARRIVE,
    );
    const give = window.setTimeout(() => setWaitedOut(true), MAX_WAIT);
    return () => {
      window.clearTimeout(stop);
      window.clearTimeout(give);
    };
  }, [reduced]);
  useEffect(() => {
    if (phase === "arriving" && braked) setPhase("stopped");
  }, [phase, braked]);
  // Stopped, and the station's there: the doors
  useEffect(() => {
    if (phase !== "stopped" || !(ready || waitedOut)) return;
    const open = window.setTimeout(
      () => setPhase("opening"),
      reduced ? 0 : 350,
    );
    return () => window.clearTimeout(open);
  }, [phase, ready, waitedOut, reduced]);
  useEffect(() => {
    if (phase === "opening") {
      const step = window.setTimeout(
        () => setPhase("stepping"),
        reduced ? 0 : OPEN,
      );
      return () => window.clearTimeout(step);
    }
    if (phase === "stepping") {
      const done = window.setTimeout(onDone, reduced ? 200 : STEP);
      return () => window.clearTimeout(done);
    }
  }, [phase, onDone, reduced]);

  const open = phase === "opening" || phase === "stepping";
  const moving = phase === "arriving";

  return (
    <div
      aria-label="Arriving at Wayside Station"
      role="img"
      className="train-arrival pointer-events-auto fixed inset-0 z-50 overflow-hidden"
      style={{
        transformOrigin: "50% 48%",
        transition: `transform ${STEP}ms cubic-bezier(0.5, 0, 0.8, 0.4), opacity ${STEP}ms ease-in`,
        transform: phase === "stepping" ? "scale(1.9)" : "none",
        opacity: phase === "stepping" ? 0 : 1,
      }}
    >
      <style>{`
        @keyframes train-rock { 0%, 100% { transform: translate(0, 0) } 25% { transform: translate(-2px, 1px) } 50% { transform: translate(1px, -1px) } 75% { transform: translate(2px, 1px) } }
        @keyframes train-halt { 0% { transform: translateX(0) } 30% { transform: translateX(7px) } 60% { transform: translateX(-3px) } 100% { transform: translateX(0) } }
        @keyframes train-streak { from { background-position-x: 0 } to { background-position-x: -2600px } }
        .train-arrival .car.moving { animation: train-rock 0.18s steps(2) infinite }
        .train-arrival .car.halted { animation: train-halt 0.45s ease-out }
        .train-arrival .streak { animation: train-streak ${ARRIVE}ms cubic-bezier(0.1, 0.6, 0.3, 1) both }
        @media (prefers-reduced-motion: reduce) { .train-arrival .car, .train-arrival .streak { animation: none !important } }
      `}</style>
      <div className={`car absolute inset-0 ${moving ? "moving" : "halted"}`}>
        {/* The doorway: everything round it is the car's wall (a huge shadow); what's
            through it is the station itself, behind this overlay */}
        <div
          className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "min(72vw, 380px)",
            height: "min(74vh, 640px)",
            boxShadow: `0 0 0 200vmax ${WALL}, inset 0 0 0 6px #6a6e74, inset 0 0 0 10px ${PANEL_DARK}`,
          }}
        >
          {/* The sign over the doors */}
          <div
            className="absolute -top-16 left-1/2 flex h-10 w-[min(64vw,300px)] -translate-x-1/2 items-center justify-center rounded-[2px] bg-[#0b0c0e] text-[15px] tracking-[0.18em] shadow-[inset_0_0_0_2px_#2a2d33]"
            style={{
              ...pixel,
              color: "#ffb03a",
              textShadow: "0 0 6px rgba(255,176,58,0.7)",
            }}
          >
            {moving ? "NEXT STOP: WAYSIDE" : "WAYSIDE"}
          </div>
          {/* The two leaves, each with a window onto the platform; they slide away into the walls */}
          <div className="absolute inset-0 overflow-hidden">
            {[-1, 1].map((side) => (
              <div
                key={side}
                className="absolute top-0 h-full w-1/2"
                style={{
                  [side < 0 ? "left" : "right"]: 0,
                  transition: `transform ${OPEN}ms cubic-bezier(0.65, 0, 0.35, 1)`,
                  transform: open ? `translateX(${side * 102}%)` : "none",
                }}
              >
                <svg
                  viewBox="0 0 100 300"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                  aria-hidden
                >
                  {/* The leaf, with its window cut out */}
                  <path
                    fillRule="evenodd"
                    fill={PANEL}
                    d={`M0 0H100V300H0Z M${side < 0 ? 18 : 12} 34H${side < 0 ? 88 : 82}V150H${side < 0 ? 18 : 12}Z`}
                  />
                  <rect
                    x={side < 0 ? 97 : 0}
                    y="0"
                    width="3"
                    height="300"
                    fill="#111"
                  />
                  <rect
                    x={side < 0 ? 16 : 10}
                    y="32"
                    width="74"
                    height="120"
                    fill="none"
                    stroke="#111"
                    strokeWidth="3"
                  />
                  <rect x="8" y="190" width="84" height="3" fill={PANEL_DARK} />
                  <rect x="8" y="250" width="84" height="3" fill={PANEL_DARK} />
                  <rect
                    x={side < 0 ? 78 : 14}
                    y="168"
                    width="8"
                    height="46"
                    rx="2"
                    fill="#8d9197"
                  />
                </svg>
                {/* In the window: lights streaking past while it's moving, the platform once it stops */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    left: side < 0 ? "18%" : "12%",
                    width: "70%",
                    top: `${(34 / 300) * 100}%`,
                    height: `${(116 / 300) * 100}%`,
                  }}
                >
                  <div
                    className="streak absolute inset-0"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, transparent 0 70px, rgba(255, 196, 120, 0.75) 70px 78px, transparent 78px 170px), repeating-linear-gradient(90deg, rgba(20, 16, 30, 0.9) 0 240px, rgba(40, 30, 50, 0.9) 240px 300px)",
                      filter: "blur(2px)",
                      transition: "opacity 0.6s ease-out",
                      opacity: moving ? 1 : 0,
                    }}
                  />
                  {/* Glass: a sheen, and dim enough outside to read as a window */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.12), transparent 40%, rgba(255,255,255,0.05) 60%, transparent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* The car: a strip light overhead and the floor underfoot */}
        <div
          className="absolute inset-x-0 top-0 h-[5vh] bg-[#e8dcc0]"
          style={{ boxShadow: "0 0 40px 10px rgba(255,230,180,0.35)" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[9vh] bg-[#1d1a18]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 22px, rgba(255,255,255,0.03) 22px 24px)",
          }}
        />
        {/* Grab poles either side of the doors */}
        {[-1, 1].map((side) => (
          <div
            key={side}
            className="absolute top-0 h-full w-2 rounded-full bg-gradient-to-r from-[#8c9096] via-[#d8dce0] to-[#6a6e74]"
            style={{ left: `calc(50% + ${side} * (min(36vw, 190px) + 28px))` }}
          />
        ))}
      </div>
    </div>
  );
}
