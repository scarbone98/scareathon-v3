// The static arena: ground, river, bridges, walls and graveyard dressing.
import * as THREE from "three";
import { BRIDGE_X, HALF_LENGTH, HALF_WIDTH, RIVER_HALF } from "../../../../server/shared/royale/index.js";
import { canvasTexture, stoneTexture, textureRng } from "./textures";

export interface Arena {
  update(dt: number): void;
}

export function buildArena(world: THREE.Group, candleSheet: THREE.Texture, candleFrames: number): Arena {
  world.add(new THREE.HemisphereLight("#b0a4ff", "#3a2446", 2.4));
  const moon = new THREE.DirectionalLight("#d8ddff", 2.8);
  moon.position.set(-8, 14, 10);
  world.add(moon);

  const halfLen = HALF_LENGTH - RIVER_HALF;
  const dirt = stoneTexture(4, "#4a3326", "#2e1f18");
  dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping;
  dirt.repeat.set(8, 1);
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirt });
  for (const side of [1, -1]) {
    const r = textureRng(side > 0 ? 11 : 12);
    const W = HALF_WIDTH * 16;
    const H = Math.round(halfLen * 8);
    const grass = canvasTexture(W, H, (ctx) => {
      for (let y = 0; y < H; y += 8)
        for (let x = 0; x < W; x += 8) {
          ctx.fillStyle = ((x + y) / 8) % 2 ? "#2d4a2c" : "#325230";
          ctx.fillRect(x, y, 8, 8);
        }
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = r() < 0.5 ? "#3d6338" : "#243d24";
        ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, r() < 0.3 ? 2 : 1);
      }
      for (const lx of [-BRIDGE_X, BRIDGE_X]) {
        const cx = (lx + HALF_WIDTH) * 8;
        ctx.fillStyle = "#5a4330";
        ctx.fillRect(cx - 7, 0, 14, H);
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = r() < 0.5 ? "#6d5540" : "#47331f";
          ctx.fillRect(cx - 7 + Math.floor(r() * 14), Math.floor(r() * H), 1, 1);
        }
      }
    });
    const top = new THREE.MeshLambertMaterial({ map: grass });
    const box = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2, 1, halfLen), [dirtMat, dirtMat, top, dirtMat, dirtMat, dirtMat]);
    box.position.set(0, -0.5, side * (RIVER_HALF + halfLen / 2));
    world.add(box);
  }

  const river = canvasTexture(
    32,
    16,
    (ctx) => {
      ctx.fillStyle = "#1b3f6e";
      ctx.fillRect(0, 0, 32, 16);
      const r = textureRng(5);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = r() < 0.5 ? "#3a7bc8" : "#2a5a96";
        ctx.fillRect(Math.floor(r() * 32), Math.floor(r() * 16), 3 + Math.floor(r() * 4), 1);
      }
    },
    [HALF_WIDTH / 2, 1],
  );
  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, RIVER_HALF * 2 + 0.2), new THREE.MeshBasicMaterial({ map: river }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  world.add(water);

  const planks = canvasTexture(16, 16, (ctx) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? "#6b4526" : "#7a522e";
      ctx.fillRect(0, i * 4, 16, 4);
      ctx.fillStyle = "#3b2414";
      ctx.fillRect(0, i * 4 + 3, 16, 1);
      ctx.fillRect(3 + i * 3, i * 4, 1, 3);
    }
  });
  const plankMat = new THREE.MeshLambertMaterial({ map: planks });
  const railMat = new THREE.MeshLambertMaterial({ color: "#3b2414" });
  const bridgeLen = RIVER_HALF * 2 + 1;
  for (const bx of [-BRIDGE_X, BRIDGE_X]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, bridgeLen), plankMat);
    deck.position.set(bx, -0.12, 0);
    world.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, bridgeLen), railMat);
      rail.position.set(bx + s * 1.2, 0.18, 0);
      world.add(rail);
    }
  }

  const wallMat = new THREE.MeshLambertMaterial({ map: stoneTexture(7, "#4b4458", "#2a2433") });
  const wallGeo = new THREE.BoxGeometry(0.7, 0.9, 1);
  for (let z = -HALF_LENGTH; z <= HALF_LENGTH; z += 1) {
    for (const x of [-HALF_WIDTH - 0.35, HALF_WIDTH + 0.35]) {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(x, 0.1 + (Math.abs(z) % 4 === 0 ? 0.25 : 0), z);
      world.add(w);
    }
  }
  for (const z of [-HALF_LENGTH - 0.35, HALF_LENGTH + 0.35]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2 + 1.4, 0.9, 0.7), wallMat);
    w.position.set(0, 0.1, z);
    world.add(w);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: "#1a1226" }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  world.add(floor);

  const r = textureRng(99);
  const graveMat = new THREE.MeshLambertMaterial({ map: stoneTexture(3, "#6b6678", "#403b4c") });
  for (let i = 0; i < 40; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (HALF_WIDTH + 1.4 + r() * 6);
    const z = (r() * 2 - 1) * (HALF_LENGTH + 3);
    const h = 0.7 + r() * 0.6;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.25), graveMat);
    stone.position.set(x, -1 + h / 2, z);
    stone.rotation.set((r() - 0.5) * 0.3, (r() - 0.5) * 0.6, (r() - 0.5) * 0.3);
    world.add(stone);
  }

  const candles: { tex: THREE.Texture; t: number }[] = [];
  for (let z = -HALF_LENGTH + 2; z <= HALF_LENGTH - 2; z += 6) {
    for (const x of [-HALF_WIDTH - 0.35, HALF_WIDTH + 0.35]) {
      const tex = candleSheet.clone();
      tex.repeat.set(1 / candleFrames, 1);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
      s.center.set(0.5, 0);
      s.scale.set(1.1, 1.1, 1);
      s.position.set(x, 0.55, z + 0.5);
      world.add(s);
      candles.push({ tex, t: r() * 5 });
    }
  }

  return {
    update(dt) {
      river.offset.x += dt * 0.12;
      for (const c of candles) {
        c.t += dt;
        c.tex.offset.x = (Math.floor(c.t * 8) % candleFrames) / candleFrames;
      }
    },
  };
}
