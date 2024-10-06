// src/components/ArcadeGallery.tsx
import React, { useEffect, useRef, useState } from "react";
import { Group, PerspectiveCamera, WebGLRenderer, Scene, Color, AnimationMixer, AmbientLight, PointLight, DirectionalLight, Mesh, VideoTexture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { useGesture } from "@use-gesture/react";
import { FaChevronLeft, FaChevronRight, FaPlay } from "react-icons/fa";
import LoadingSpinner from "../../components/LoadingSpinner";

type MachineData = {
  name: string;
  videoUrl?: string;
  game: React.ReactNode;
};

type Props = {
  machinesData: MachineData[];
  onPlay: (machine: MachineData) => void;
};

const ArcadeGallery: React.FC<Props> = ({ onPlay, machinesData }) => {
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
    renderer.setPixelRatio(window.devicePixelRatio);
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

    // Create a mapping of machine names to video textures
    const videoTextureArray: VideoTexture[] = [];

    machinesData.forEach((machine) => {
      const video = document.createElement("video");
      video.src = machine.videoUrl || "";
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.play();

      const videoTexture = new VideoTexture(video);
      videoTexture.repeat.set(1, 1);

      videoTextureArray.push(videoTexture);
    });

    // Load the GLB model using GLTFLoader
    const loader = new GLTFLoader();
    const machines: Group[] = [];
    const totalMachines = machinesData.length;
    const radius = 5;

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
        const angle = ((totalMachines - i) / totalMachines) * Math.PI * 2;
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
            const videoTexture = videoTextureArray[i];

            if (videoTexture) {
              newMaterial.map = videoTexture;

              // Fix for flipped texture
              newMaterial.map.flipY = true;
              newMaterial.map.repeat.set(1, -1);
              newMaterial.map.offset.set(0, 1);

              child.material = newMaterial;
            } else {
              console.error(
                `No video texture found for machine: ${machineName}`
              );
            }
          }
        });

        scene.add(machine);
        machines.push(machine);
      }

      machinesRef.current = machines;
      setIsLoading(false);
    });

    const animate = (): void => {
      requestAnimationFrame(animate);
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
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      window.removeEventListener("resize", handleResize);
      videoTextureArray.forEach((texture) => {
        texture.dispose();
      });
    };
  }, [machinesData]);

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
    setFocusedMachine(machinesData[0]);
  }, []);

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
