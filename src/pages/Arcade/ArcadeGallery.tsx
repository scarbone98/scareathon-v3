// src/components/ArcadeGallery.tsx
import React, { useEffect, useRef, useState } from "react";
import { Group, PerspectiveCamera, WebGLRenderer, Scene, Color, AnimationMixer, AmbientLight, PointLight, DirectionalLight, Mesh, CanvasTexture, SRGBColorSpace, Vector3 } from "three";
import type { MeshStandardMaterial } from "three";
import { createArcadeAmbience, type ArcadeAmbience } from "./arcadeAmbience";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { useGesture } from "@use-gesture/react";
import { FaChevronLeft, FaChevronRight, FaPlay } from "react-icons/fa";
import LoadingSpinner from "../../components/LoadingSpinner";

type MachineData = {
  name: string;
  videoUrl?: string;
  availableOnMobile?: boolean;
  game: React.ReactNode;
};

type Props = {
  initialMachineName?: string;
  machinesData: MachineData[];
  onPlay: (machine: MachineData) => void;
};

// Neon colours cycle across the cabinets so neighbours never match
const MARQUEE_NEON_COLORS = ["#ff2d55", "#39ff9f", "#2de2ff", "#c86bff", "#ffa31a"];
const MARQUEE_GLOW = 1.4;

// Paint a game's name as a neon sign: dark backing, a coloured halo, a brighter
// inner glow and a near-white core, like a lit glass tube.
function drawNeonMarquee(canvas: HTMLCanvasElement, name: string, color: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;

  context.shadowBlur = 0;
  const backing = context.createLinearGradient(0, 0, 0, height);
  backing.addColorStop(0, "#0c0612");
  backing.addColorStop(1, "#030105");
  context.fillStyle = backing;
  context.fillRect(0, 0, width, height);

  const wash = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.45);
  wash.addColorStop(0, `${color}30`);
  wash.addColorStop(1, `${color}00`);
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  // Thin neon border tube
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.shadowColor = color;
  context.shadowBlur = 24;
  context.strokeRect(22, 22, width - 44, height - 44);

  const label = name.replace(/[\u2018\u2019]/g, "'").toUpperCase();
  let fontSize = 220;
  context.font = `${fontSize}px Zombie, Creepster, cursive`;
  while (context.measureText(label).width > width * 0.86 && fontSize > 60) {
    fontSize -= 6;
    context.font = `${fontSize}px Zombie, Creepster, cursive`;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  const x = width / 2;
  const y = height / 2 + fontSize * 0.04;

  context.fillStyle = color;
  for (const blur of [70, 36, 14]) {
    context.shadowColor = color;
    context.shadowBlur = blur;
    context.fillText(label, x, y);
  }
  context.shadowColor = "#ffffff";
  context.shadowBlur = 6;
  context.fillStyle = "#fff4f8";
  context.globalAlpha = 0.85;
  context.fillText(label, x, y);
  context.globalAlpha = 1;
}

function createMarqueeTexture(name: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 340; // about the marquee's 6:1 shape
  drawNeonMarquee(canvas, name, color);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  // The first paint may use a fallback font; repaint once the Zombie web font is ready
  document.fonts
    ?.load("220px Zombie")
    .then(() => {
      drawNeonMarquee(canvas, name, color);
      texture.needsUpdate = true;
    })
    .catch(() => {});
  return texture;
}

// Brief neon flicker every ~9s, staggered per cabinet
function marqueeFlicker(time: number, seed: number) {
  const phase = (time + seed * 3.7) % 9;
  if (phase > 0.45) return 1;
  return Math.sin(phase * 70) > 0.2 ? 1 : 0.3;
}

// How much the video is enlarged past "fit the whole frame": trims a little off
// portrait clips' top and bottom so they read larger on the wide cabinet screen.
const SCREEN_VIDEO_ZOOM = 1.15;

const ArcadeGallery: React.FC<Props> = ({
  initialMachineName,
  onPlay,
  machinesData,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const machinesRef = useRef<Group[]>([]);
  const currentAngle = useRef<number>(0);
  const isAnimating = useRef<boolean>(false);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [focusedMachine, setFocusedMachine] = useState<MachineData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  const getInitialMachineIndex = () => {
    if (!initialMachineName) return 0;

    const index = machinesData.findIndex(
      (machine) => machine.name === initialMachineName
    );
    return index >= 0 ? index : 0;
  };

  const getAngleForMachineIndex = (index: number) => {
    if (machinesData.length === 0) return 0;
    return index * ((Math.PI * 2) / machinesData.length);
  };

  const positionMachines = (angleOffset: number) => {
    machinesRef.current.forEach((machine, index) => {
      const angle =
        ((machinesRef.current.length - index) / machinesRef.current.length) *
          Math.PI *
          2 +
        angleOffset;

      machine.position.x = 5 * Math.sin(angle);
      machine.position.z = 5 * Math.cos(angle);
    });
  };

  // Gsap promise mode instead of callback
  function promiseModeGsap(target: Vector3, config: gsap.TweenVars) {
    return new Promise((resolve) => {
      gsap.to(target, {
        ...config,
        onComplete: resolve,
      });
    });
  }

  useEffect(() => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(-0.0065, 1.6, 6.75);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true });
    // Phones report 3x; 2x looks the same here and draws far fewer pixels
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Improved lighting setup
    const ambientLight = new AmbientLight(0xffffff, 0.5); // Softer ambient light
    scene.add(ambientLight);

    const pointLight = new PointLight(0xffaa55, 1, 50); // Point light with a warm color
    pointLight.position.set(0, 5, 5); // Adjust position to be slightly in front and above the machines
    scene.add(pointLight);

    // Add a directional light for stronger illumination
    const directionalLight = new DirectionalLight(0xffffff, 5);
    directionalLight.position.set(5, 10, 5); // Position the light above and to the side
    directionalLight.castShadow = true; // Enable shadows if needed
    scene.add(directionalLight);

    // The cabinet screen is about 1.88:1. Draw each video inside a canvas with
    // that aspect ratio so portrait and 16:9 recordings keep their proportions.
    const marquees: { material: MeshStandardMaterial; texture: CanvasTexture; seed: number }[] = [];
    let ambience: ArcadeAmbience | null = null;
    let disposed = false;

    const screenVideos = machinesData.map((machine) => {
      if (!machine.videoUrl) return null;

      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = machine.videoUrl;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      context?.fillRect(0, 0, canvas.width, canvas.height);

      // Tiny canvas used as a cheap, cross-browser blur: shrink the frame, then scale it back up
      const backdrop = document.createElement("canvas");
      backdrop.width = 32;
      backdrop.height = 17;
      const backdropContext = backdrop.getContext("2d");

      const texture = new CanvasTexture(canvas);
      // Preserve the orientation used by the cabinet model's screen UVs.
      texture.flipY = true;
      texture.repeat.set(1, -1);
      texture.offset.set(0, 1);

      let frameRequest: number | undefined;
      let lastTime = -1;
      const drawFrame = () => {
        if (!context || !video.videoWidth || !video.videoHeight) return;

        const fitScale = Math.min(
          canvas.width / video.videoWidth,
          canvas.height / video.videoHeight
        );
        const fillScale = Math.max(
          canvas.width / video.videoWidth,
          canvas.height / video.videoHeight
        );

        // Backdrop: the same footage filling the screen, blurred and dimmed, instead of black bars
        context.fillStyle = "black";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (backdropContext) {
          const backdropScale = fillScale * (backdrop.width / canvas.width);
          const backdropWidth = video.videoWidth * backdropScale;
          const backdropHeight = video.videoHeight * backdropScale;
          backdropContext.drawImage(
            video,
            (backdrop.width - backdropWidth) / 2,
            (backdrop.height - backdropHeight) / 2,
            backdropWidth,
            backdropHeight
          );
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(backdrop, 0, 0, canvas.width, canvas.height);
          context.fillStyle = "rgba(0, 0, 0, 0.45)";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Foreground: the whole clip, a little larger than a strict fit but never past filling the screen
        const scale = Math.min(fitScale * SCREEN_VIDEO_ZOOM, fillScale);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        // When the zoom overflows vertically, trim mostly from the bottom: titles and logos sit at the top
        const top = height > canvas.height ? (canvas.height - height) * 0.2 : (canvas.height - height) / 2;
        context.drawImage(video, (canvas.width - width) / 2, top, width, height);
        texture.needsUpdate = true;
      };
      video.addEventListener("loadeddata", drawFrame);

      const hasVideoFrameCallback =
        typeof video.requestVideoFrameCallback === "function";
      if (hasVideoFrameCallback) {
        const onFrame: VideoFrameRequestCallback = () => {
          drawFrame();
          frameRequest = video.requestVideoFrameCallback(onFrame);
        };
        frameRequest = video.requestVideoFrameCallback(onFrame);
      }

      video.play().catch(() => {
        // Autoplay can be denied; the first available frame is still shown.
      });

      return {
        texture,
        updateFrame: () => {
          if (!hasVideoFrameCallback && video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            drawFrame();
          }
        },
        dispose: () => {
          if (frameRequest !== undefined) video.cancelVideoFrameCallback(frameRequest);
          video.removeEventListener("loadeddata", drawFrame);
          video.pause();
          video.removeAttribute("src");
          video.load();
          texture.dispose();
        },
      };
    });

    // Load the GLB model using GLTFLoader
    const loader = new GLTFLoader();
    const machines: Group[] = [];
    const totalMachines = machinesData.length;
    const radius = 5;
    currentAngle.current = getAngleForMachineIndex(getInitialMachineIndex());

    loader.load("/models/ArcadeCabinet.glb", (gltf: any) => {
      const model = gltf.scene;

      model.traverse((child: any) => {
        if (child instanceof Mesh) {
          if (child.material) {
            child.material.emissive = new Color(0x222222);
            child.material.emissiveIntensity = 0.25;
            child.material.needsUpdate = true;
          }
        }
      });

      model.scale.set(0.5, 0.5, 0.5);
      model.rotation.y = Math.PI;
      model.rotation.x = Math.PI / 2;
      model.rotation.z = -Math.PI * 2;

      for (let i = 0; i < totalMachines; i++) {
        const machine = model.clone();
        // Change the angle calculation to reverse the order
        const angle =
          ((totalMachines - i) / totalMachines) * Math.PI * 2 +
          currentAngle.current;
        machine.position.x = radius * Math.sin(angle);
        machine.position.z = radius * Math.cos(angle);

        const machineName = machinesData[i].name;
        machine.userData.machineName = machineName;

        // Apply video texture to the screen
        machine.traverse((child: any) => {
          if (
            child instanceof Mesh &&
            child.material &&
            child.material.name === "GreyScreen"
          ) {
            const newMaterial = child.material.clone();
            const videoTexture = screenVideos[i]?.texture;

            if (videoTexture) {
              newMaterial.map = videoTexture;

              child.material = newMaterial;
            }
          } else if (
            child instanceof Mesh &&
            child.material &&
            child.material.name === "Marque"
          ) {
            // Light the marquee with the game's name as a neon sign
            const marquee = child.material.clone() as MeshStandardMaterial;
            const texture = createMarqueeTexture(
              machineName,
              MARQUEE_NEON_COLORS[i % MARQUEE_NEON_COLORS.length]
            );
            marquee.map = texture;
            marquee.emissiveMap = texture;
            marquee.color = new Color("#ffffff");
            marquee.emissive = new Color("#ffffff");
            marquee.emissiveIntensity = MARQUEE_GLOW;
            child.material = marquee;
            marquees.push({ material: marquee, texture, seed: i });
          }
        });

        scene.add(machine);
        machines.push(machine);
      }

      machinesRef.current = machines;
      if (!disposed) {
        ambience = createArcadeAmbience({
          scene,
          ambientLight,
          machines,
          neonColors: MARQUEE_NEON_COLORS,
          glowLevel: (index, time) => marqueeFlicker(time, index),
        });
      }
      setFocusedMachine(machinesData[getInitialMachineIndex()] ?? null);
      setIsLoading(false);
    });

    let animationFrame: number;
    let lastFrameTime = performance.now() / 1000;
    const animate = (): void => {
      animationFrame = requestAnimationFrame(animate);
      const frameTime = performance.now() / 1000;
      ambience?.update(frameTime, Math.min(frameTime - lastFrameTime, 0.1));
      lastFrameTime = frameTime;
      screenVideos.forEach((screenVideo) => screenVideo?.updateFrame());
      const time = performance.now() / 1000;
      marquees.forEach(({ material, seed }) => {
        material.emissiveIntensity = MARQUEE_GLOW * marqueeFlicker(time, seed);
      });
      // Update the animation mixer
      if (mixerRef.current) {
        mixerRef.current.update(0.016); // Assuming 60fps, adjust if needed
      }
      renderer.render(scene, camera);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      window.removeEventListener("resize", handleResize);
      screenVideos.forEach((screenVideo) => screenVideo?.dispose());
      marquees.forEach(({ texture }) => texture.dispose());
      disposed = true;
      ambience?.dispose();
      renderer.dispose();
    };
  }, [initialMachineName, machinesData]);

  const updateFocusedMachine = () => {
    const focusedIndex =
      Math.round(
        currentAngle.current / ((Math.PI * 2) / machinesRef.current.length)
      ) % machinesRef.current.length;
    const normalizedIndex =
      (focusedIndex + machinesRef.current.length) % machinesRef.current.length;

    setFocusedMachine(machinesData[normalizedIndex]);
  };

  const rotateMachines = async (direction: number): Promise<void> => {
    setShowControls(false);
    if (isAnimating.current || !cameraRef.current) return;
    isAnimating.current = true;

    const camera = cameraRef.current;
    const angleIncrement = (Math.PI * 2) / machinesRef.current.length;
    currentAngle.current += direction * angleIncrement;

    // Zoom camera out
    await promiseModeGsap(camera.position, {
      z: 10,
      duration: 0.2,
      ease: "power1.inOut",
    });

    const animationPromises = machinesRef.current.map((machine, index) => {
      // Change the angle calculation to reverse the order
      const angle =
        ((machinesRef.current.length - index) / machinesRef.current.length) *
          Math.PI *
          2 +
        currentAngle.current;
      const targetX = 5 * Math.sin(angle);
      const targetZ = 5 * Math.cos(angle);

      // Animate the machine to its new position
      return promiseModeGsap(machine.position, {
        x: targetX,
        z: targetZ,
        duration: 0.3,
        ease: "power1.inOut",
      });
    });

    await Promise.all(animationPromises);

    // Zoom camera in
    await promiseModeGsap(camera.position, {
      z: 6.75,
      duration: 0.2,
      ease: "power1.inOut",
    });

    updateFocusedMachine();
    isAnimating.current = false;
    setShowControls(true);
  };

  const bind = useGesture({
    onDrag: ({ direction: [xDir], velocity: [xVel] }) => {
      if (Math.abs(xVel) > 0.2) {
        rotateMachines(xDir > 0 ? 1 : -1);
      }
    },
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowRight") {
        rotateMachines(-1);
      } else if (event.key === "ArrowLeft") {
        rotateMachines(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Update focused machine on component mount
  useEffect(() => {
    const initialMachineIndex = getInitialMachineIndex();
    currentAngle.current = getAngleForMachineIndex(initialMachineIndex);
    positionMachines(currentAngle.current);
    setFocusedMachine(machinesData[initialMachineIndex] ?? null);
  }, [initialMachineName, machinesData]);

  const handleRotate = (direction: number) => {
    rotateMachines(direction);
  };

  const handlePlay = () => {
    if (focusedMachine) {
      onPlay(focusedMachine);
    }
  };

  return (
    <>
      {isLoading && <LoadingSpinner />}
      <div
        ref={mountRef}
        {...bind()}
        style={{
          width: "100vw",
          height: "100vh",
          touchAction: "none",
          position: "relative",
        }}
      >
        {showControls && (
          <>
            <button
              onClick={() => handleRotate(1)}
              style={{
                position: "fixed",
                left: "20px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "2rem",
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
              }}
            >
              <FaChevronLeft />
            </button>
            <button
              onClick={() => handleRotate(-1)}
              style={{
                position: "fixed",
                right: "20px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "2rem",
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
              }}
            >
              <FaChevronRight />
            </button>
            <button
              onClick={handlePlay}
              style={{
                position: "fixed",
                left: "50%",
                bottom: "50px",
                transform: "translateX(-50%)",
                fontSize: "2rem",
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "50%",
                width: "60px",
                height: "60px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
                cursor: "pointer",
              }}
            >
              <FaPlay />
            </button>
          </>
        )}
        {focusedMachine && showControls && (
          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: "125px",
              transform: "translateX(-50%)",
              background: "rgba(0, 0, 0, 0.8)",
              padding: "10px 20px",
              borderRadius: "20px",
              color: "white",
              textAlign: "center",
              fontSize: "1rem",
            }}
          >
            Play "{focusedMachine.name}"?
          </div>
        )}
      </div>
    </>
  );
};

export default ArcadeGallery;
