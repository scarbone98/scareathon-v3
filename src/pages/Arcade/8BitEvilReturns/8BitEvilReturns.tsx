import { useEffect, useRef } from "react"; // added
import { useNavigatorContext } from "../../../components/navigator/context";

type GameRendererProps = {
  url: string;
  onLoad?: (
    iframe: HTMLIFrameElement
  ) => () => void | ((iframe: HTMLIFrameElement) => void)[] | undefined;
};

function GameRenderer({ url, onLoad }: GameRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { height: headerHeight } = useNavigatorContext();

  useEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe) return;

    iframe.style.overflow = "hidden";

    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // Mobile device style: fill the whole browser client area with the game canvas:
      var meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content =
        "width=device-width, height=device-height, initial-scale=1.0, user-scalable=no, shrink-to-fit=yes";
      document.getElementsByTagName("head")[0].appendChild(meta);

      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.position = "absolute";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.zIndex = "1";

      document.body.style.textAlign = "left";
    } else {
      const height = window.innerHeight;
      iframe.style.marginTop = `${headerHeight / 2}px`;
      iframe.style.height = `${height - headerHeight}px`;
      iframe.style.width = `${height * (9 / 16)}px`;
      iframe.style.zIndex = "1";
    }

    if (onLoad) {
      const functionsToRun = onLoad(iframe);
      return () => {
        if (Array.isArray(functionsToRun)) {
          functionsToRun.forEach((func: () => void) => func());
        } else if (typeof functionsToRun === "function") {
          functionsToRun();
        }
      };
    }
  }, [onLoad]);

  return <iframe ref={iframeRef} title="8BitEvilReturns" src={url}></iframe>;
}

export default GameRenderer;
