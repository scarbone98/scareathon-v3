// src/components/ArcadeGallery.tsx
import React, { useEffect, useRef, useState } from "react";
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

  const [animationSpeedMultiplier, setAnimationSpeedMultiplier] =
    useState<number>(1);

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
    camera.position.set(0, 1, 10);
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
    pointLight.position.set(0, 2, 0); // Positioned above the glowing cube
    scene.add(pointLight);

    // Adding a glowing cube in the center
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00, // Glow effect
      emissiveIntensity: 0.5,
    });
    const glowingCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    glowingCube.position.set(0, 0.5, 0); // Slightly elevated from the ground
    scene.add(glowingCube);

    // Load the GLB model using GLTFLoader
    const loader = new GLTFLoader();
    const machines: THREE.Group[] = [];
    const totalMachines = machinesData.length;
    const radius = 5;

    loader.load("/src/assets/models/ArcadeMachine.glb", (gltf: any) => {
      const model = gltf.scene;

      model.scale.set(0.2, 0.2, 0.2);
      model.rotation.y = -Math.PI / 2;

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
      duration: 0.2 / animationSpeedMultiplier,
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
        duration: 0.3 / animationSpeedMultiplier,
        ease: "power1.inOut",
      });
    });

    await Promise.all(animationPromises);

    // Zoom camera in
    await promiseModeGsap(camera.position, {
      z: 6.5,
      duration: 0.2 / animationSpeedMultiplier,
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
