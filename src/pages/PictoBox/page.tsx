import ContentControls, { useBlocks } from "../../station/things/ContentControls";
import { useCallback, useEffect, useRef, useState } from "react";
import { ago, hoursLeft, loadWall, photoUrl, postPhoto, removePhoto, useSession, type Photo } from "./api";
import { develop, enlarge, exposeFrame, SENSOR_H, SENSOR_W, type PictoStyle } from "./filter";
import "./pictoBox.css";

// Picto Box: the arcade's community camera. Point your camera at something,
// snap a toy-camera picture, and hang it on the wall for everyone to see. The
// wall keeps the last day's photos. Anyone can look; posting needs a login.

type View = "camera" | "review" | "wall";
type CameraState = "off" | "starting" | "on" | "error";

// A short mechanical click-clack for the shutter
function shutterSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audio = new AudioCtx();
    const clack = (at: number, pitch: number) => {
      const length = 0.05;
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = pitch;
      source.connect(filter).connect(audio.destination);
      source.start(audio.currentTime + at);
    };
    clack(0, 2400);
    clack(0.09, 1400);
    setTimeout(() => audio.close(), 500);
  } catch {
    // No sound, no matter
  }
}

// Sign in happens on the site itself, outside the arcade cabinet's frame
function goSignIn() {
  try {
    (window.top ?? window).location.href = "/authentication";
  } catch {
    window.location.href = "/authentication";
  }
}

function Print({ src, caption, sub, tilt = 0, onClick }: { src: string; caption?: string; sub?: string; tilt?: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="pb-print relative block w-full text-left"
      style={{ transform: `rotate(${tilt}deg)` }}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="pb-pin" />
      <img src={src} alt={caption ? `Picto by ${caption}` : "Picto"} className="block aspect-[4/3] w-full object-cover" style={{ imageRendering: "pixelated" }} />
      {caption && (
        <span className="absolute bottom-1 left-2 right-2 flex items-baseline justify-between gap-2 text-[15px] leading-5 text-[#5a2e0e]">
          <span className="truncate">{caption}</span>
          <span className="shrink-0 text-[12px] text-[#9c6a3a]">{sub}</span>
        </span>
      )}
    </button>
  );
}

export default function PictoBoxPage() {
  const session = useSession();
  const signedIn = !!session;
  const [view, setView] = useState<View>("camera");
  const [camera, setCamera] = useState<CameraState>("off");
  const [cameraError, setCameraError] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [style, setStyle] = useState<PictoStyle>("sepia");
  const [shot, setShot] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState("");
  const blocks = useBlocks();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [wallState, setWallState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState<Photo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const sensorRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const styleRef = useRef(style);
  const facingRef = useRef(facing);
  styleRef.current = style;
  facingRef.current = facing;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  const startCamera = useCallback(async (which: "user" | "environment") => {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setCameraError("This browser can't reach a camera.");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: which, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setCamera("on");
    } catch (error) {
      const name = (error as DOMException)?.name;
      setCamera("error");
      setCameraError(
        name === "NotAllowedError"
          ? "The Picto Box needs your camera. Allow it in your browser, then try again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : "The camera wouldn't start. Try again?"
      );
    }
  }, [stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // The live viewfinder: every frame through the toy-camera filter
  useEffect(() => {
    if (camera !== "on" || view !== "camera") return;
    if (!sensorRef.current) {
      sensorRef.current = document.createElement("canvas");
      sensorRef.current.width = SENSOR_W;
      sensorRef.current.height = SENSOR_H;
    }
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (time - last < 1000 / 24) return; // a toy runs at toy speed
      last = time;
      const video = videoRef.current;
      const sensor = sensorRef.current;
      const target = viewRef.current;
      if (!video || !sensor || !target || video.readyState < 2) return;
      exposeFrame(sensor, video, video.videoWidth, video.videoHeight, styleRef.current, facingRef.current === "user");
      enlarge(sensor, target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [camera, view]);

  const refreshWall = useCallback(async () => {
    try {
      const wall = await loadWall();
      setPhotos(wall.photos);
      setWallState("ready");
    } catch {
      setWallState("error");
    }
  }, []);

  useEffect(() => {
    refreshWall();
  }, [refreshWall, signedIn]);

  const snap = () => {
    const sensor = sensorRef.current;
    if (!sensor || camera !== "on") return;
    shutterSound();
    setFlash((n) => n + 1);
    setShot(develop(sensor));
    setNotice("");
    setView("review");
  };

  const hangIt = async () => {
    if (!shot) return;
    setPosting(true);
    setNotice("");
    try {
      await postPhoto(shot, style);
      setShot(null);
      await refreshWall();
      setView("wall");
      stopCamera();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const takeDown = async (photo: Photo) => {
    try {
      await removePhoto(photo.id);
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
      setOpen(null);
      setConfirmDelete(false);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const goCamera = () => {
    setView("camera");
    if (camera === "off") startCamera(facing);
  };
  const goWall = () => {
    setView("wall");
    refreshWall();
    stopCamera();
  };
  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    startCamera(next);
  };

  return (
    <div className="pb-root fixed inset-0 z-[60] overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[640px] flex-col items-center px-4 pb-8 pt-4">
        <h1 className="pb-title text-center text-5xl sm:text-6xl">Picto Box</h1>
        <p className="mb-3 mt-1 text-center text-lg text-[#1d4f7a]">Snap it, hang it on the wall. Pictos come down after a day.</p>

        <div className="mb-4 flex gap-3">
          <button type="button" className={`pb-btn px-5 py-1.5 text-xl ${view !== "wall" ? "pb-cream" : "pb-sea"}`} onClick={goCamera}>
            Camera
          </button>
          <button type="button" className={`pb-btn px-5 py-1.5 text-xl ${view === "wall" ? "pb-cream" : "pb-sea"}`} onClick={goWall}>
            The Wall{photos.length ? ` (${photos.length})` : ""}
          </button>
        </div>

        {view !== "wall" && (
          <div className="pb-box relative w-full p-4 pt-5 sm:p-6">
            {[["left-3 top-3"], ["right-3 top-3"], ["left-3 bottom-3"], ["right-3 bottom-3"]].map(([at]) => (
              <span key={at} className={`pb-bolt ${at}`} />
            ))}
            <div className="pb-window relative mx-auto aspect-[4/3] w-full overflow-hidden">
              <video ref={videoRef} className="hidden" playsInline muted />
              {view === "camera" && (
                <>
                  <canvas ref={viewRef} width={SENSOR_W * 3} height={SENSOR_H * 3} className="h-full w-full" style={{ imageRendering: "pixelated" }} />
                  {camera !== "on" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[#f1dcae]">
                      {camera === "starting" && <p className="text-2xl">Winding the film...</p>}
                      {camera === "off" && (
                        <>
                          <p className="text-2xl">Lens cap's on.</p>
                          <button type="button" className="pb-btn pb-cream px-6 py-2 text-2xl" onClick={() => startCamera(facing)}>
                            Open the camera
                          </button>
                        </>
                      )}
                      {camera === "error" && (
                        <>
                          <p className="text-xl">{cameraError}</p>
                          <button type="button" className="pb-btn pb-cream px-6 py-2 text-xl" onClick={() => startCamera(facing)}>
                            Try again
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {camera === "on" && (
                    <>
                      <span className="pb-bracket left-3 top-3 border-l-4 border-t-4" />
                      <span className="pb-bracket right-3 top-3 border-r-4 border-t-4" />
                      <span className="pb-bracket bottom-3 left-3 border-b-4 border-l-4" />
                      <span className="pb-bracket bottom-3 right-3 border-b-4 border-r-4" />
                    </>
                  )}
                </>
              )}
              {view === "review" && shot && <img src={shot} alt="Your picto" className="pb-develop h-full w-full" style={{ imageRendering: "pixelated" }} />}
              {flash > 0 && <div key={flash} className="pb-flash pointer-events-none absolute inset-0 bg-white" />}
            </div>

            {view === "camera" && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="pb-btn pb-cream w-28 py-2 text-lg"
                  onClick={() => setStyle(style === "sepia" ? "color" : "sepia")}
                >
                  {style === "sepia" ? "Sepia" : "Color"}
                </button>
                <button
                  type="button"
                  aria-label="Take the picto"
                  className="pb-btn pb-shutter h-20 w-20 shrink-0"
                  onClick={snap}
                  disabled={camera !== "on"}
                />
                <button type="button" className="pb-btn pb-cream w-28 py-2 text-lg" onClick={flip} disabled={camera === "starting"}>
                  Flip
                </button>
              </div>
            )}

            {view === "review" && (
              <div className="mt-4 flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-3">
                  {signedIn ? (
                    <button type="button" className="pb-btn pb-shutter px-6 py-2 text-xl text-white" onClick={hangIt} disabled={posting}>
                      {posting ? "Hanging it..." : "Hang it on the wall"}
                    </button>
                  ) : (
                    <button type="button" className="pb-btn pb-sea px-6 py-2 text-xl" onClick={goSignIn}>
                      Sign in to hang it up
                    </button>
                  )}
                  <button
                    type="button"
                    className="pb-btn pb-cream px-6 py-2 text-xl"
                    onClick={() => {
                      setShot(null);
                      setView("camera");
                      if (camera === "off") startCamera(facing);
                    }}
                  >
                    Retake
                  </button>
                </div>
                {notice && <p className="rounded-lg bg-[#fff4d6] px-3 py-1 text-center text-lg text-[#9c1c0e]">{notice}</p>}
              </div>
            )}
          </div>
        )}

        {view === "wall" && (
          <div className="pb-board w-full p-4 sm:p-5">
            {wallState === "loading" && <p className="py-10 text-center text-2xl">Fetching the pictos...</p>}
            {wallState === "error" && (
              <div className="py-8 text-center">
                <p className="text-2xl">The wall wouldn't load.</p>
                <button type="button" className="pb-btn pb-cream mt-3 px-5 py-1.5 text-xl" onClick={refreshWall}>
                  Try again
                </button>
              </div>
            )}
            {wallState === "ready" && photos.length === 0 && (
              <p className="py-10 text-center text-2xl">Nothing on the wall today. Be the first!</p>
            )}
            {wallState === "ready" && photos.length > 0 && (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                {photos.filter(photo => !photo.userId || !blocks.has(photo.userId)).map((photo, i) => (
                  <Print
                    key={photo.id}
                    src={photoUrl(photo.id)}
                    caption={photo.mine ? "You" : photo.username}
                    sub={ago(photo.createdAt)}
                    tilt={((i * 37) % 7) - 3}
                    onClick={() => {
                      setOpen(photo);
                      setConfirmDelete(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b2a4a]/80 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-[560px]" onClick={(event) => event.stopPropagation()}>
            <Print src={photoUrl(open.id)} caption={open.mine ? "You" : open.username} sub={`${ago(open.createdAt)} · ${hoursLeft(open.createdAt)}h left`} />
            <ContentControls targetType="photo" targetId={open.id} userId={open.userId} onChange={() => setOpen(null)} />
            <div className="mt-5 flex justify-center gap-3">
              {open.canDelete &&
                (confirmDelete ? (
                  <button type="button" className="pb-btn pb-shutter px-5 py-1.5 text-xl text-white" onClick={() => takeDown(open)}>
                    Yes, take it down
                  </button>
                ) : (
                  <button type="button" className="pb-btn pb-cream px-5 py-1.5 text-xl" onClick={() => setConfirmDelete(true)}>
                    Take it down
                  </button>
                ))}
              <button type="button" className="pb-btn pb-sea px-5 py-1.5 text-xl" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
            {notice && <p className="mt-3 text-center text-lg text-[#fff4d6]">{notice}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
