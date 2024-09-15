// src/components/ArcadeGallery.tsx
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { useGesture } from "@use-gesture/react";

type MachineData = {
  name: string;
  description: string;
  image: string;
};

type Props = {
  machinesData: MachineData[];
  onMachineSelected?: (machine: MachineData) => void;
};

const ArcadeGallery: React.FC<Props> = ({
  onMachineSelected,
  machinesData,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const machinesRef = useRef<THREE.Group[]>([]);
  const currentAngle = useRef<number>(0);
  const isAnimating = useRef<boolean>(false);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Gsap promise mode instead of callback
  function promiseModeGsap(target: THREE.Vector3, config: gsap.TweenVars) {
    return new Promise((resolve) => {
      gsap.to(target, {
        ...config,
        onComplete: resolve,
      });
    });
  }

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.75, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Improved lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Softer ambient light
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffaa55, 1, 50); // Point light with a warm color
    pointLight.position.set(0, 5, 5); // Adjust position to be slightly in front and above the machines
    scene.add(pointLight);

    // Add a directional light for stronger illumination
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.set(5, 10, 5); // Position the light above and to the side
    directionalLight.castShadow = true; // Enable shadows if needed
    scene.add(directionalLight);

    // Load the GLB model using GLTFLoader
    const loader = new GLTFLoader();
    const machines: THREE.Group[] = [];
    const totalMachines = machinesData.length;
    const radius = 5;

    loader.load("/models/ArcadeCabinet.glb", (gltf: any) => {
      const model = gltf.scene;

      // Adjust material properties
      model.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          if (child.material) {
            child.material.emissive = new THREE.Color(0x222222); // Slight emissive glow
            child.material.emissiveIntensity = 0.25; // Adjust intensity
            child.material.needsUpdate = true; // Ensure the material updates
          }
        }
      });

      model.scale.set(0.5, 0.5, 0.5);
      model.rotation.y = Math.PI;
      model.rotation.x = Math.PI / 2;
      model.rotation.z = -Math.PI * 2;

      for (let i = 0; i < totalMachines; i++) {
        const machine = model.clone();
        machine.position.x =
          radius * Math.sin((i / totalMachines) * Math.PI * 2);
        machine.position.z =
          radius * Math.cos((i / totalMachines) * Math.PI * 2);
        scene.add(machine);
        machines.push(machine);
      }

      machinesRef.current = machines;
    });

    const animate = (): void => {
      requestAnimationFrame(animate);
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
    };
  }, []);

  const rotateMachines = async (direction: number): Promise<void> => {
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
      const targetX =
        5 *
        Math.sin(
          (index / machinesRef.current.length) * Math.PI * 2 +
            currentAngle.current
        );
      const targetZ =
        5 *
        Math.cos(
          (index / machinesRef.current.length) * Math.PI * 2 +
            currentAngle.current
        );

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
      z: 6.5,
      duration: 0.2,
      ease: "power1.inOut",
    });

    isAnimating.current = false;

    // Calculate the index of the machine in focus
    const focusedIndex =
      Math.round(currentAngle.current / angleIncrement) %
      machinesRef.current.length;
    const normalizedIndex =
      (focusedIndex + machinesRef.current.length) % machinesRef.current.length;

    if (onMachineSelected) {
      onMachineSelected(machinesData[normalizedIndex]);
    }
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

  return (
    <div
      ref={mountRef}
      {...bind()}
      style={{ width: "100vw", height: "100vh", touchAction: "none" }}
    />
  );
};

export default ArcadeGallery;
