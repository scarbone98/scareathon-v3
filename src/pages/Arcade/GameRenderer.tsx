import { useEffect, useRef } from "react"; // added

type GameRendererCleanup = void | (() => void) | (() => void)[];

// Holding a virtual stick on a phone shouldn't start a text selection, the
// long-press callout or a zoom. Cross-origin games have to handle this in
// their own page; same-origin ones get this style injected.
const NO_TOUCH_GESTURES_CSS = `
  html, body {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  canvas { touch-action: none; }
`;

// iOS Safari ignores user-scalable=no, so pinch zoom has to be cancelled by hand
const preventGesture = (event: Event) => event.preventDefault();

function guardFrameDocument(iframe: HTMLIFrameElement) {
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return;
  }
  if (!doc?.head || doc.getElementById("arcade-no-touch-gestures")) return;
  const style = doc.createElement("style");
  style.id = "arcade-no-touch-gestures";
  style.textContent = NO_TOUCH_GESTURES_CSS;
  doc.head.appendChild(style);
  doc.addEventListener("gesturestart", preventGesture);
}

type GameRendererProps = {
  url: string;
  onLoad?: (iframe: HTMLIFrameElement) => GameRendererCleanup;
  title: string;
  desktopAspectRatio?: number;
  reservedVerticalSpace?: number;
  // Permissions policy for the game frame, e.g. "accelerometer; gyroscope" for tilt controls.
  allow?: string;
};

function GameRenderer({
  url,
  title,
  onLoad,
  desktopAspectRatio = 9 / 16,
  reservedVerticalSpace = 0,
  allow,
}: GameRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe) return;

    iframe.style.overflow = "hidden";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.userSelect = "none";
    iframe.style.touchAction = "none";
    iframe.style.setProperty("-webkit-user-select", "none");
    iframe.style.setProperty("-webkit-touch-callout", "none");

    const handleFrameLoad = () => guardFrameDocument(iframe);
    iframe.addEventListener("load", handleFrameLoad);
    handleFrameLoad();
    document.addEventListener("gesturestart", preventGesture);

    // A game with more than one view (Tlaloc's Curse: tall like a phone, or squarer for a
    // desktop) says which shape it wants: { type: "ASPECT_RATIO", ratio: width / height }
    let askedAspectRatio: number | null = null;

    const applyIframeSize = () => {
      const viewportHeight =
        iframe.parentElement?.parentElement?.clientHeight || window.innerHeight;
      const availableHeight = viewportHeight - reservedVerticalSpace;
      const availableWidth = window.innerWidth;

      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        iframe.style.width = `${availableWidth}px`;
        iframe.style.height = `${availableHeight}px`;
        iframe.style.marginTop = "0";
        iframe.style.zIndex = "1";
        return;
      }

      const aspectRatio = askedAspectRatio ?? desktopAspectRatio;
      const viewportAspectRatio = availableWidth / availableHeight;
      const height =
        viewportAspectRatio > aspectRatio
          ? availableHeight
          : availableWidth / aspectRatio;
      const width = height * aspectRatio;

      iframe.style.height = `${height}px`;
      iframe.style.width = `${width}px`;
      iframe.style.marginTop = "0";
      iframe.style.zIndex = "0";
    };

    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // Mobile device style: fill the whole browser client area with the game canvas:
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content =
        "width=device-width, height=device-height, initial-scale=1.0, user-scalable=no, shrink-to-fit=yes";
      document.getElementsByTagName("head")[0].appendChild(meta);

      document.body.style.textAlign = "left";
    }

    const handleAspectRatio = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.data?.type !== "ASPECT_RATIO") return;
      const ratio = Number(event.data.ratio);
      if (!Number.isFinite(ratio) || ratio < 0.3 || ratio > 4) return;
      askedAspectRatio = ratio;
      applyIframeSize();
    };
    window.addEventListener("message", handleAspectRatio);

    applyIframeSize();
    window.addEventListener("resize", applyIframeSize);
    const resizeObserver =
      iframe.parentElement?.parentElement && "ResizeObserver" in window
        ? new ResizeObserver(applyIframeSize)
        : null;

    if (resizeObserver && iframe.parentElement?.parentElement) {
      resizeObserver.observe(iframe.parentElement.parentElement);
    }

    let functionsToRun: GameRendererCleanup;

    if (onLoad) {
      functionsToRun = onLoad(iframe);
    }

    return () => {
      window.removeEventListener("resize", applyIframeSize);
      window.removeEventListener("message", handleAspectRatio);
      iframe.removeEventListener("load", handleFrameLoad);
      document.removeEventListener("gesturestart", preventGesture);
      resizeObserver?.disconnect();

      if (Array.isArray(functionsToRun)) {
        functionsToRun.forEach((func: () => void) => func());
      } else if (typeof functionsToRun === "function") {
        functionsToRun();
      }
    };
  }, [desktopAspectRatio, onLoad, reservedVerticalSpace]);

  return <iframe ref={iframeRef} title={title} src={url} allow={allow}></iframe>;
}

export default GameRenderer;
