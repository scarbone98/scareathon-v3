import React, { useEffect, useState, useRef, useCallback } from 'react';

interface Ghost {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
}

const GhostCursor: React.FC = () => {
  const [position, setPosition] = useState({ x: window.innerWidth/2, y: window.innerHeight/2 });
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  // Adjust these constants to control ghost behavior
  const BASE_GHOST_COUNT = 25;
  const GHOST_COUNT = window.innerWidth <= 768 ? Math.floor(BASE_GHOST_COUNT / 2) : BASE_GHOST_COUNT;
  const MAX_SPEED = 8;
  const ACCELERATION = 0.45;
  const DRAG = 0.6;
  const BOUNCE_FACTOR = 0.7;
  const ORBIT_RADIUS = 50;
  const ORBIT_SPEED = 0.12;
  const SEPARATION_RADIUS = 100;
  const COHESION_RADIUS = 100;
  const ALIGNMENT_RADIUS = 100;
  const SEPARATION_FORCE = 0.075;
  const COHESION_FORCE = 0.001;
  const ALIGNMENT_FORCE = 0.01;

  const initializeGhosts = useCallback(() => {
    return Array.from({ length: GHOST_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * MAX_SPEED,
      vy: (Math.random() - 0.5) * MAX_SPEED,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitSpeed: ORBIT_SPEED * (0.8 + Math.random() * 0.4),
      orbitRadius: ORBIT_RADIUS * (0.8 + Math.random() * 0.4)
    }));
  }, [GHOST_COUNT]);

  useEffect(() => {
    const updatePosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', updatePosition);
    setGhosts(initializeGhosts());

    return () => window.removeEventListener('mousemove', updatePosition);
  }, [initializeGhosts]);

  const applyFlockingBehavior = (ghost: Ghost, neighbors: Ghost[]) => {
    let separationX = 0, separationY = 0, separationCount = 0;
    let cohesionX = 0, cohesionY = 0, cohesionCount = 0;
    let alignmentX = 0, alignmentY = 0, alignmentCount = 0;

    for (const other of neighbors) {
      if (other.id === ghost.id) continue;

      const dx = other.x - ghost.x;
      const dy = other.y - ghost.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < SEPARATION_RADIUS) {
        separationX -= dx / distance;
        separationY -= dy / distance;
        separationCount++;
      }

      if (distance < COHESION_RADIUS) {
        cohesionX += other.x;
        cohesionY += other.y;
        cohesionCount++;
      }

      if (distance < ALIGNMENT_RADIUS) {
        alignmentX += other.vx;
        alignmentY += other.vy;
        alignmentCount++;
      }
    }

    let vx = ghost.vx, vy = ghost.vy;

    if (separationCount > 0) {
      vx += (separationX / separationCount) * SEPARATION_FORCE;
      vy += (separationY / separationCount) * SEPARATION_FORCE;
    }

    if (cohesionCount > 0) {
      cohesionX = cohesionX / cohesionCount - ghost.x;
      cohesionY = cohesionY / cohesionCount - ghost.y;
      vx += cohesionX * COHESION_FORCE;
      vy += cohesionY * COHESION_FORCE;
    }

    if (alignmentCount > 0) {
      alignmentX = alignmentX / alignmentCount - ghost.vx;
      alignmentY = alignmentY / alignmentCount - ghost.vy;
      vx += alignmentX * ALIGNMENT_FORCE;
      vy += alignmentY * ALIGNMENT_FORCE;
    }

    return { vx, vy };
  };

  const animateGhosts = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = (time - previousTimeRef.current) / 16;

      setGhosts(prevGhosts => prevGhosts.map(ghost => {
        let { x, y, vx, vy, orbitAngle, orbitSpeed, orbitRadius } = ghost;

        orbitAngle += orbitSpeed * deltaTime;

        const targetX = position.x + Math.cos(orbitAngle) * orbitRadius;
        const targetY = position.y + Math.sin(orbitAngle) * orbitRadius;

        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        vx += (dx / distance) * ACCELERATION * deltaTime;
        vy += (dy / distance) * ACCELERATION * deltaTime;

        const flockingBehavior = applyFlockingBehavior(ghost, prevGhosts);
        vx += flockingBehavior.vx;
        vy += flockingBehavior.vy;

        vx *= DRAG;
        vy *= DRAG;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > MAX_SPEED) {
          vx = (vx / speed) * MAX_SPEED;
          vy = (vy / speed) * MAX_SPEED;
        }

        x += vx * deltaTime;
        y += vy * deltaTime;

        if (x < -20 || x > window.innerWidth) {
          vx = -vx * BOUNCE_FACTOR;
          x = x < 0 ? 0 : window.innerWidth;
        }
        if (y < 0 || y > window.innerHeight) {
          vy = -vy * BOUNCE_FACTOR;
          y = y < 0 ? 0 : window.innerHeight;
        }

        return { ...ghost, x, y, vx, vy, orbitAngle };
      }));
    }

    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animateGhosts);
  }, [position]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animateGhosts);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animateGhosts]);

  return (
    <>
      {ghosts.map(ghost => (
        <div
          key={ghost.id}
          className="ghost-cursor"
          style={{
            transform: `translate(${ghost.x}px, ${ghost.y}px) scaleX(${ghost.vx > 0 ? 1 : -1})`,
          }}
        />
      ))}
    </>
  );
};

export default GhostCursor;
