import { useEffect, useRef } from "react"; // added

type GameRendererCleanup = void | (() => void) | (() => void)[];

type GameRendererProps = {
  url: string;
  onLoad?: (iframe: HTMLIFrameElement) => GameRendererCleanup;
  title: string;
  desktopAspectRatio?: number;
  reservedVerticalSpace?: number;
};

function GameRenderer({
  url,
  title,
  onLoad,
  desktopAspectRatio = 9 / 16,
  reservedVerticalSpace = 0,
}: GameRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe) return;

    iframe.style.overflow = "hidden";
    iframe.style.border = "0";
    iframe.style.display = "block";

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

      const viewportAspectRatio = availableWidth / availableHeight;
      const height =
        viewportAspectRatio > desktopAspectRatio
          ? availableHeight
          : availableWidth / desktopAspectRatio;
      const width = height * desktopAspectRatio;

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
      resizeObserver?.disconnect();

      if (Array.isArray(functionsToRun)) {
        functionsToRun.forEach((func: () => void) => func());
      } else if (typeof functionsToRun === "function") {
        functionsToRun();
      }
    };
  }, [desktopAspectRatio, onLoad, reservedVerticalSpace]);

  return <iframe ref={iframeRef} title={title} src={url}></iframe>;
}

export default GameRenderer;
