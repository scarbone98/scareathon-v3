// src/components/ArcadeGallery.tsx
import React, { useEffect, useRef, useState } from "react";
import { Group, PerspectiveCamera, WebGLRenderer, Scene, Color, AnimationMixer, AmbientLight, PointLight, DirectionalLight, Mesh, CanvasTexture, Vector3 } from "three";
import type { MeshStandardMaterial } from "three";
import { createArcadeAmbience, type ArcadeAmbience } from "./arcadeAmbience";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { useGesture } from "@use-gesture/react";
import { FaChevronLeft, FaChevronRight, FaPlay } from "react-icons/fa";
import LoadingSpinner from "../../components/LoadingSpinner";
import type { MachineData } from "./games.tsx";
import {
  MARQUEE_GLOW,
  MARQUEE_NEON_COLORS,
  createMarqueeTexture,
  createScreenVideo,
  isLightweightDevice,
  marqueeFlicker,
} from "./cabinetParts.ts";

type Props = {
  initialMachineName?: string;
  machinesData: MachineData[];
  onPlay: (machine: MachineData) => void;
  // True while a game is open over the carousel: stop rendering and videos so the game gets the GPU
  paused?: boolean;
};

const ArcadeGallery: React.FC<Props> = ({
  initialMachineName,
  onPlay,
  machinesData,
  paused = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const screenVideoElementsRef = useRef<(HTMLVideoElement | null)[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
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

    const lightweight = isLightweightDevice();
    // MSAA on a dense phone screen costs a lot and is hard to see; so is rendering past 1.5x there
    const renderer = new WebGLRenderer({ antialias: !lightweight });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lightweight ? 1.5 : 2));
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

    const marquees: { material: MeshStandardMaterial; texture: CanvasTexture; seed: number }[] = [];
    let ambience: ArcadeAmbience | null = null;
    let disposed = false;

    const screenVideos = machinesData.map((machine) =>
      machine.videoUrl ? createScreenVideo(machine.videoUrl, lightweight) : null
    );

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

    screenVideoElementsRef.current = screenVideos.map((screenVideo) => screenVideo?.video ?? null);

    let animationFrame: number;
    let lastFrameTime = performance.now() / 1000;
    const animate = (): void => {
      animationFrame = requestAnimationFrame(animate);
      if (pausedRef.current) return; // a game is open on top; leave the GPU to it
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

  // Decode only the cabinet in front: phones have few hardware video decoders, and every playing
  // video is re-uploaded to the GPU each frame. The others keep showing their last frame.
  useEffect(() => {
    const syncPlayback = () => {
      const focusedIndex = focusedMachine ? machinesData.indexOf(focusedMachine) : -1;
      screenVideoElementsRef.current.forEach((video, index) => {
        if (!video) return;
        if (index === focusedIndex && !paused && !document.hidden) {
          video.play().catch(() => {
            // Autoplay can be denied; the first frame is still shown
          });
        } else {
          video.pause();
        }
      });
    };
    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => document.removeEventListener("visibilitychange", syncPlayback);
  }, [focusedMachine, machinesData, paused]);

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
              aria-label={focusedMachine ? `Play ${focusedMachine.name}` : "Play"}
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
