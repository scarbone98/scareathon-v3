import * as THREE from "three";
import type { GameState } from "../sim.ts";
import { HERO_OBSTACLES, gatesEnabled, isObstacleCleared, type HeroObstacle } from "./obstacles.ts";

interface GateMesh { obstacle: HeroObstacle; door: THREE.Group; pulse: THREE.MeshStandardMaterial[] }
const HERO_COLOR = { you: 0xb0f3d1, joe: 0x79ebff, matt: 0xffd06f, alex: 0xbada86, jon: 0xc39beb };

/** Presentation only. All horizontal bounds come from the collision registry. */
export class HeroObstacleMeshes {
  private group = new THREE.Group();
  private gates: GateMesh[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  private disposed = false;
  private worldId: string;
  private heightAt: (x: number, y: number) => number;

  constructor(scene: THREE.Scene, worldId: string, heightAt: (x: number, y: number) => number) {
    this.worldId = worldId; this.heightAt = heightAt;
    this.group.name = `locks-obstacles-${worldId}`;
    this.geometries.add(this.boxGeometry); this.geometries.add(this.rockGeometry);
    for (const obstacle of HERO_OBSTACLES.filter(entry => entry.worldId === worldId)) this.build(obstacle);
    scene.add(this.group);
  }

  private material(color: number, emissive = false): THREE.MeshStandardMaterial {
    const key = `${color}:${emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: emissive ? .45 : .87, metalness: emissive ? .18 : .04,
        ...(emissive ? { emissive: color, emissiveIntensity: .8 } : {}) });
      this.materials.set(key, material);
    }
    return material;
  }

  private box(parent: THREE.Group, color: number, x: number, y: number, z: number, w: number, h: number, d: number, emissive = false): THREE.Mesh {
    const mesh = new THREE.Mesh(this.boxGeometry, this.material(color, emissive));
    mesh.position.set(x, this.heightAt(x, z) + y + h / 2, z); mesh.scale.set(w, h, d);
    mesh.castShadow = !emissive; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  private rock(parent: THREE.Group, color: number, x: number, z: number, w: number, h: number, d: number, rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(this.rockGeometry, this.material(color));
    mesh.position.set(x, this.heightAt(x, z) + h / 2, z); mesh.scale.set(w / 2, h / 2, d / 2);
    mesh.rotation.y = rotation; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  private build(obstacle: HeroObstacle) {
    for (const wall of obstacle.walls) {
      const x = wall.x + wall.w / 2, z = wall.y + wall.h / 2;
      this.box(this.group, 0x485e4c, x, 0, z, wall.w, 11, wall.h);
      this.box(this.group, 0x949c7d, x, 11, z, wall.w, 1.5, wall.h);
      const horizontal = wall.w >= wall.h, length = horizontal ? wall.w : wall.h;
      for (let offset = 2; offset < length - 2; offset += 12) {
        this.box(this.group, 0x607356, horizontal ? wall.x + offset : x, 3, horizontal ? z : wall.y + offset,
          horizontal ? 1 : wall.w + .1, 6, horizontal ? wall.h + .1 : 1);
      }
    }
    const cache = obstacle.rewardAnchor;
    this.box(this.group, 0x926e50, cache.x, 0, cache.y, 20, 11, 12);
    this.box(this.group, 0xe3bc78, cache.x, 8, cache.y, 21, 2, 13);
    const door = new THREE.Group(); door.name = obstacle.id; this.group.add(door);
    const pulse: THREE.MeshStandardMaterial[] = [];
    const { x, y, w, h } = obstacle, cx = x + w / 2, cz = y + h / 2;
    if (obstacle.kind === "boulder") {
      this.box(door, 0x596e5f, cx, 0, cz, w, 3, h);
      this.rock(door, 0x8a9380, cx, cz, w * 1.02, 25, h * 1.08, .21);
      this.rock(door, 0xabb19a, cx - w * .19, cz - h * .15, w * .4, 23, h * .67, .63);
      // A dark zigzag across the front face reads as Joe's cracked stone.
      for (let n = 0; n < 4; n++) {
        const crack = this.box(door, 0x293f36, cx + (n % 2 ? 1.4 : -1.4), n * 5 + 2, y + h * .94, 1.2, 6, .6);
        crack.rotation.z = n % 2 ? .46 : -.4;
      }
    } else if (obstacle.kind === "vent") {
      this.box(door, 0x203b42, cx, 0, cz, w, 22, h);
      this.box(door, 0x10262c, cx, 3, y + h + .15, w - 4, 16, .5);
      for (let offset = 2; offset < w; offset += 4) this.box(door, 0x9aada2, x + offset, 3, y + h + .5, 1, 16, .8);
      for (const height of [2, 8, 14, 20]) this.box(door, 0x6b8c8b, cx, height, y + h + .9, w, 1, .8);
      for (const px of [x + 1, x + w - 1]) this.box(door, 0xb7c0aa, px, 0, y + h, 2, 22, 2);
    } else if (obstacle.kind === "terminal") {
      for (const px of [x + 2, x + w - 2]) {
        this.box(door, 0x2b454b, px, 0, cz, 4, 28, h);
        this.box(door, 0x92aaa0, px, 25, cz, 5, 3, h + 1);
      }
      this.box(door, 0x182a32, x + 3, 12, y + h, 9, 13, 3);
      this.box(door, 0xbada86, x + 3, 17, y + h + 1.6, 6, 5, .4, true);
      for (const height of [6, 14, 22]) {
        const beam = this.box(door, 0x88f1cb, cx, height, cz, w - 6, .8, .8, true);
        pulse.push(beam.material as THREE.MeshStandardMaterial);
      }
    } else {
      for (let n = 0; n < 6; n++) {
        const startX = x + 1 + n * (w - 2) / 5, endX = x + w - 1 - n * (w - 2) / 5;
        const floor = this.heightAt(startX, cz);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(startX, floor + 1, y + h - 1),
          new THREE.Vector3(startX + (n % 2 ? 5 : -5), floor + 8, cz),
          new THREE.Vector3(endX - (n % 2 ? 4 : -4), floor + 16, cz),
          new THREE.Vector3(endX, floor + 23, y + 1),
        ]);
        const geometry = new THREE.TubeGeometry(curve, 10, 1.25, 5, false); this.geometries.add(geometry);
        const stem = new THREE.Mesh(geometry, this.material(n % 2 ? 0x718451 : 0x486841)); stem.castShadow = true; door.add(stem);
        for (let leaf = 1; leaf < 4; leaf++) {
          const point = curve.getPoint(leaf / 4), geometry = new THREE.SphereGeometry(1, 6, 4); this.geometries.add(geometry);
          const mesh = new THREE.Mesh(geometry, this.material(leaf % 2 ? 0xa1a566 : 0x63844c));
          mesh.position.copy(point); mesh.scale.set(3, .6, 1.4); mesh.rotation.z = n * .7; mesh.castShadow = true; door.add(mesh);
          const thorn = new THREE.ConeGeometry(.5, 2.8, 4); this.geometries.add(thorn);
          const tip = new THREE.Mesh(thorn, this.material(0xd0b98a)); tip.position.copy(point); tip.position.y += 1.2; tip.rotation.z = .5; door.add(tip);
        }
      }
    }
    const marker = this.box(door, HERO_COLOR[obstacle.hero], cx, 29, cz, 3.5, 3.5, 1.2, true); marker.rotation.z = Math.PI / 4;
    this.gates.push({ obstacle, door, pulse });
  }

  update(state: GameState, time: number): void {
    if (this.disposed) return;
    this.group.visible = gatesEnabled(state) && state.mapId === this.worldId && !state.film;
    for (const gate of this.gates) {
      const cleared = isObstacleCleared(state, gate.obstacle.id);
      const effect = state.effects.find(e => Math.abs(e.x-gate.obstacle.x-gate.obstacle.w/2)<1 && Math.abs(e.y-gate.obstacle.y-gate.obstacle.h/2)<1);
      const progress = cleared ? effect ? 1-effect.ttl/effect.maxT : 1 : 0;
      gate.door.position.y = -36*progress*progress;
      gate.door.visible = !cleared || progress<1;
      for (const material of gate.pulse) material.emissiveIntensity = .65 + .25 * Math.sin(time * 3);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.group.clear(); this.geometries.clear(); this.materials.clear(); this.gates.length = 0;
  }
}
