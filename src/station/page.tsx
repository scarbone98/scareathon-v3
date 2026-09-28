import { Suspense, lazy, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { isStopId, STOPS, STOP_IDS, type StopId } from "./stops.ts";

const StationScene = lazy(() => import("./StationScene.tsx"));

// Wayside Station: a 3D train platform whose objects open the site's pages.
// Lives at /station for now; the rest of the site is untouched. The selected stop
// is kept in ?at= so the browser's Back button moves the camera.
export default function StationPage() {
  const [params, setParams] = useSearchParams();
  const at = params.get("at");
  const selected: StopId = isStopId(at) ? at : "platform";
  const stop = STOPS[selected];

  const select = (id: StopId) => setParams(id === "platform" ? {} : { at: id });

  // One fixed screen: no page scrolling behind the scene
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((el) => [el.style.overflow, el.style.overscrollBehavior]);
    targets.forEach((el) => {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    });
    return () => {
      targets.forEach((el, i) => {
        el.style.overflow = previous[i][0];
        el.style.overscrollBehavior = previous[i][1];
      });
    };
  }, []);

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <div className="fixed inset-0 bg-black">
        <Suspense fallback={<LoadingSpinner />}>
          <StationScene selected={selected} onSelect={select} />
        </Suspense>

        <div className="pointer-events-none absolute inset-x-0 top-[88px] flex items-start justify-between px-4">
          {selected !== "platform" ? (
            <button
              type="button"
              onClick={() => select("platform")}
              className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/30 backdrop-blur"
            >
              ← Platform
            </button>
          ) : (
            <span />
          )}
          <Link
            to="/"
            className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm text-amber-100/80 ring-1 ring-amber-200/20 backdrop-blur"
          >
            Plain site
          </Link>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-black/75 p-4 text-amber-50 ring-1 ring-amber-200/25 backdrop-blur">
            <h1 className="text-lg font-semibold">{selected === "platform" ? "Wayside Station" : stop.label}</h1>
            <p className="mt-1 text-sm text-amber-100/80">{stop.blurb}</p>
            {stop.href && (
              <Link
                to={stop.href}
                className="mt-3 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black"
              >
                {stop.cta}
              </Link>
            )}
          </div>
        </div>

        {/* Real controls for keyboard and screen-reader users: the canvas is only a picture */}
        <nav className="sr-only" aria-label="Station objects">
          {STOP_IDS.map((id) => (
            <button key={id} type="button" onClick={() => select(id)}>
              {STOPS[id].label}
            </button>
          ))}
        </nav>
      </div>
    </AnimatedPage>
  );
}
