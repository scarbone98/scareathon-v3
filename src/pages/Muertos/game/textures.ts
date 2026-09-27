// Every texture is painted on a canvas at load, at PS1 sizes: a 4x4 atlas
// of 64 px tiles for the ground and walls, plus signs and decals.
import * as THREE from "three";
import { mulberry32 } from "./sim";
import { WEAPONS, type WeaponId } from "./weapons";

export const TILE = {
  cobbles: 0,
  plaza: 1,
  grass: 2,
  earth: 3,
  fortFloor: 4,
  path: 5,
  fortWall: 6,
  cliff: 7,
  doorGround: 8,
  windowGround: 9,
  balcony: 10,
  shutters: 11,
  cornice: 12,
  windowHole: 13,
  plaster: 14,
  planks: 15,
  roof: 16,
  roofPainted: 17,
  arcade: 18,
  stoneHole: 19,
  barWall: 20,
  barFloor: 21,
  terrace: 22,
  woodFloor: 23,
} as const;

// The atlas is 4 tiles across and 6 down.
const ATLAS_ROWS = 6;

export function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// UVs of a tile, inset half a pixel so neighbours don't bleed in.
export function tileUV(i: number): [number, number, number, number] {
  const cx = i % 4;
  const cy = Math.floor(i / 4);
  const e = 0.5 / 256;
  const f = 0.5 / (64 * ATLAS_ROWS);
  return [cx / 4 + e, 1 - (cy + 1) / ATLAS_ROWS + f, (cx + 1) / 4 - e, 1 - cy / ATLAS_ROWS - f];
}

const hex = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

export function atlasTexture() {
  return canvasTexture(256, 64 * ATLAS_ROWS, (x) => {
    const rnd = mulberry32(42);
    const tile = (i: number, draw: (ox: number, oy: number) => void) => {
      const ox = (i % 4) * 64;
      const oy = Math.floor(i / 4) * 64;
      x.save();
      x.beginPath();
      x.rect(ox, oy, 64, 64);
      x.clip();
      draw(ox, oy);
      x.restore();
    };
    const noise = (ox: number, oy: number, n: number, colors: string[], w = 1, h = 1) => {
      for (let i = 0; i < n; i++) {
        x.fillStyle = colors[Math.floor(rnd() * colors.length)];
        x.fillRect(ox + Math.floor(rnd() * 64), oy + Math.floor(rnd() * 64), w, h);
      }
    };

    // Adoquines: the blue-grey slag cobbles of Old San Juan.
    tile(TILE.cobbles, (ox, oy) => {
      x.fillStyle = "#1a1f2a";
      x.fillRect(ox, oy, 64, 64);
      for (let row = 0; row < 9; row++) {
        const off = row % 2 ? -5 : 0;
        for (let col = 0; col < 7; col++) {
          const v = rnd();
          x.fillStyle = hex(78 + v * 30, 92 + v * 32, 118 + v * 36);
          x.fillRect(ox + off + col * 10 + 1, oy + row * 7 + 1, 8, 5);
          x.fillStyle = "rgba(255,255,255,0.14)";
          x.fillRect(ox + off + col * 10 + 1, oy + row * 7 + 1, 8, 1);
        }
      }
    });
    tile(TILE.plaza, (ox, oy) => {
      x.fillStyle = "#6e695e";
      x.fillRect(ox, oy, 64, 64);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const v = rnd();
          x.fillStyle = hex(150 + v * 30, 142 + v * 28, 124 + v * 24);
          x.fillRect(ox + c * 16 + 1, oy + r * 16 + 1, 15, 15);
        }
      noise(ox, oy, 120, ["#8a8272", "#b0a690"]);
    });
    tile(TILE.grass, (ox, oy) => {
      x.fillStyle = "#3e5a32";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 500, ["#35502b", "#4b6a3a", "#56773f", "#2d4424"], 1, 2);
    });
    tile(TILE.earth, (ox, oy) => {
      x.fillStyle = "#4e4234";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 380, ["#3f352a", "#5e503e", "#6b5c48", "#2f4a2a"], 2, 1);
    });
    tile(TILE.fortFloor, (ox, oy) => {
      x.fillStyle = "#8a7856";
      x.fillRect(ox, oy, 64, 64);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 4; c++) {
          const v = rnd();
          x.fillStyle = hex(168 + v * 24, 148 + v * 22, 108 + v * 18);
          x.fillRect(ox + c * 16 + (r % 2) * 8 + 1, oy + r * 8 + 1, 14, 6);
        }
      noise(ox, oy, 80, ["#6c5c42"]);
    });
    tile(TILE.path, (ox, oy) => {
      x.fillStyle = "#6e5c44";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 360, ["#5a4a36", "#7e6c52", "#8c7a5e", "#4c3e2e"], 2, 1);
    });
    // Sandstone ashlar, the walls of El Morro and the city.
    tile(TILE.fortWall, (ox, oy) => {
      x.fillStyle = "#9c8660";
      x.fillRect(ox, oy, 64, 64);
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) {
          const v = rnd();
          x.fillStyle = hex(206 + v * 26, 186 + v * 22, 140 + v * 20);
          x.fillRect(ox + c * 22 + (r % 2) * 11 - 11 + 1, oy + r * 13 + 1, 20, 11);
        }
      noise(ox, oy, 160, ["#8e7a58", "#b8a27a", "#6e6048"]);
      x.fillStyle = "rgba(40,40,30,0.25)";
      for (let i = 0; i < 4; i++) x.fillRect(ox + rnd() * 64, oy + 30 + rnd() * 20, 2, 34);
    });
    tile(TILE.cliff, (ox, oy) => {
      x.fillStyle = "#3b3934";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 260, ["#2c2a26", "#4a4740", "#56524a", "#24221f"], 3, 2);
      x.fillStyle = "#1c1b18";
      for (let i = 0; i < 6; i++) x.fillRect(ox + rnd() * 64, oy + rnd() * 64, 1, 10 + rnd() * 14);
    });

    // Facades are painted near white so each house's colour tints them.
    const plaster = (ox: number, oy: number) => {
      x.fillStyle = "#f4f2ee";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 140, ["#e6e2da", "#fbfaf6", "#d8d2c6"]);
      x.fillStyle = "rgba(60,50,40,0.18)";
      for (let i = 0; i < 3; i++) x.fillRect(ox + rnd() * 64, oy + rnd() * 20, 1 + rnd() * 2, 18 + rnd() * 30);
    };
    // 64 px tall is 3.5 m: y px = (1 - m / 3.5) * 64.
    const m = (metres: number) => Math.round((1 - metres / 3.5) * 64);
    tile(TILE.doorGround, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#8d8a86";
      x.fillRect(ox, oy + m(0.35), 64, 64);
      x.fillStyle = "#c9c4ba";
      x.fillRect(ox + 14, oy + m(2.9), 36, m(0) - m(2.9));
      x.fillStyle = "#3d2616";
      x.fillRect(ox + 18, oy + m(2.6), 28, m(0) - m(2.6));
      x.beginPath();
      x.arc(ox + 32, oy + m(2.6), 14, Math.PI, 0);
      x.fill();
      x.fillStyle = "#2a190e";
      x.fillRect(ox + 31, oy + m(2.6), 2, m(0) - m(2.6));
      for (let i = 0; i < 4; i++) x.fillRect(ox + 20, oy + m(2.3) + i * 9, 24, 1);
      x.fillStyle = "#c9a23a";
      x.fillRect(ox + 28, oy + m(1.1), 2, 2);
      x.fillRect(ox + 34, oy + m(1.1), 2, 2);
    });
    tile(TILE.windowGround, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#8d8a86";
      x.fillRect(ox, oy + m(0.35), 64, 64);
      x.fillStyle = "#c9c4ba";
      x.fillRect(ox + 15, oy + m(2.7), 34, m(0.8) - m(2.7) + 3);
      x.fillStyle = "#1a1620";
      x.fillRect(ox + 18, oy + m(2.5), 28, m(0.9) - m(2.5));
      x.fillStyle = "#101014";
      for (let i = 0; i < 6; i++) x.fillRect(ox + 20 + i * 5, oy + m(2.5), 1, m(0.9) - m(2.5));
      x.fillStyle = "rgba(255,190,110,0.35)";
      x.fillRect(ox + 22, oy + m(2.1), 6, 8);
    });
    tile(TILE.balcony, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#cfc9be";
      x.fillRect(ox + 14, oy + m(3.1), 36, m(0.45) - m(3.1));
      x.fillStyle = "#5c5750";
      x.fillRect(ox + 17, oy + m(2.9), 30, m(0.5) - m(2.9));
      x.fillStyle = "#3e3a35";
      for (let i = 0; i < 12; i++) x.fillRect(ox + 18, oy + m(2.8) + i * 3, 13, 1);
      for (let i = 0; i < 12; i++) x.fillRect(ox + 33, oy + m(2.8) + i * 3, 13, 1);
      x.fillStyle = "#2a2622";
      x.fillRect(ox + 31, oy + m(2.9), 2, m(0.5) - m(2.9));
      // Wrought-iron balcony.
      x.fillStyle = "#131215";
      x.fillRect(ox + 8, oy + m(1.3), 48, 2);
      x.fillRect(ox + 8, oy + m(0.35), 48, 3);
      for (let i = 0; i < 13; i++) x.fillRect(ox + 9 + i * 3.7, oy + m(1.3), 1, m(0.35) - m(1.3));
      x.fillStyle = "#77746e";
      x.fillRect(ox + 6, oy + m(0.35), 52, 4);
    });
    tile(TILE.shutters, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#cfc9be";
      x.fillRect(ox + 15, oy + m(3.0), 34, m(0.9) - m(3.0));
      x.fillStyle = "#6a655c";
      x.fillRect(ox + 18, oy + m(2.8), 28, m(1.0) - m(2.8));
      x.fillStyle = "#4e4a43";
      for (let i = 0; i < 11; i++) x.fillRect(ox + 19, oy + m(2.7) + i * 3, 26, 1);
      x.fillStyle = "#2a2622";
      x.fillRect(ox + 31, oy + m(2.8), 2, m(1.0) - m(2.8));
      x.fillStyle = "#9a958c";
      x.fillRect(ox + 13, oy + m(1.0), 38, 3);
    });
    tile(TILE.cornice, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#fbfaf8";
      x.fillRect(ox, oy + 36, 64, 8);
      x.fillStyle = "#9d978c";
      x.fillRect(ox, oy + 44, 64, 3);
      x.fillStyle = "#e8e4dc";
      x.fillRect(ox, oy, 64, 6);
      x.fillStyle = "#b6b0a4";
      x.fillRect(ox, oy + 6, 64, 2);
    });
    tile(TILE.windowHole, (ox, oy) => {
      plaster(ox, oy);
      x.fillStyle = "#8d8a86";
      x.fillRect(ox, oy + m(0.35), 64, 64);
      x.fillStyle = "#c9c4ba";
      x.fillRect(ox + 8, oy + m(2.45), 48, m(0.6) - m(2.45) + 2);
    });
    tile(TILE.plaster, plaster);
    tile(TILE.planks, (ox, oy) => {
      for (let i = 0; i < 8; i++) {
        const v = rnd();
        x.fillStyle = hex(110 + v * 30, 72 + v * 20, 40 + v * 14);
        x.fillRect(ox, oy + i * 8, 64, 8);
        x.fillStyle = "#2e1c10";
        x.fillRect(ox, oy + i * 8 + 7, 64, 1);
      }
      noise(ox, oy, 60, ["#4a2e18"]);
    });
    // Flat roofs, seen from above: a parapet round the edge, patched
    // concrete, a drain.
    const roof = (i: number, base: string, patch: string[]) =>
      tile(i, (ox, oy) => {
        x.fillStyle = base;
        x.fillRect(ox, oy, 64, 64);
        noise(ox, oy, 220, patch, 2, 2);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = "rgba(40,36,30,0.12)";
          x.fillRect(ox + 6 + rnd() * 40, oy + 6 + rnd() * 40, 8 + rnd() * 14, 6 + rnd() * 10);
        }
        x.fillStyle = "#f4f1ea";
        x.fillRect(ox, oy, 64, 3);
        x.fillRect(ox, oy + 61, 64, 3);
        x.fillRect(ox, oy, 3, 64);
        x.fillRect(ox + 61, oy, 3, 64);
        x.fillStyle = "rgba(0,0,0,0.22)";
        x.fillRect(ox + 3, oy + 3, 58, 2);
        x.fillRect(ox + 3, oy + 3, 2, 58);
        x.fillStyle = "#3a3630";
        x.fillRect(ox + 56, oy + 56, 3, 3);
      });
    // El Morro's casemates: sandstone with a deep arched doorway, and the
    // same stone round a boarded window.
    const ashlar = (ox: number, oy: number) => {
      x.fillStyle = "#9c8660";
      x.fillRect(ox, oy, 64, 64);
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 3; c++) {
          const v = rnd();
          x.fillStyle = hex(206 + v * 26, 186 + v * 22, 140 + v * 20);
          x.fillRect(ox + c * 22 + (r % 2) * 11 - 11 + 1, oy + r * 11 + 1, 20, 9);
        }
      noise(ox, oy, 120, ["#8e7a58", "#b8a27a"]);
    };
    tile(TILE.arcade, (ox, oy) => {
      ashlar(ox, oy);
      x.fillStyle = "#e0cfa4";
      x.fillRect(ox + 8, oy + 18, 48, 46);
      x.beginPath();
      x.arc(ox + 32, oy + 22, 24, Math.PI, 0);
      x.fill();
      x.fillStyle = "#1c1612";
      x.fillRect(ox + 12, oy + 22, 40, 42);
      x.beginPath();
      x.arc(ox + 32, oy + 22, 20, Math.PI, 0);
      x.fill();
      x.fillStyle = "rgba(255,170,90,0.12)";
      x.fillRect(ox + 14, oy + 50, 36, 14);
    });
    tile(TILE.stoneHole, (ox, oy) => {
      ashlar(ox, oy);
      x.fillStyle = "#e0cfa4";
      x.fillRect(ox + 8, oy + m(2.45), 48, m(0.6) - m(2.45) + 2);
    });
    // Bar rooms: wood wainscot, warm plaster, posters and bottle shelves.
    tile(TILE.barWall, (ox, oy) => {
      x.fillStyle = "#e8d8b8";
      x.fillRect(ox, oy, 64, 64);
      noise(ox, oy, 80, ["#dccaa6", "#f0e2c6"]);
      x.fillStyle = "#5a3620";
      x.fillRect(ox, oy + 40, 64, 24);
      x.fillStyle = "#3e2414";
      for (let i = 0; i < 8; i++) x.fillRect(ox + i * 8, oy + 40, 1, 24);
      x.fillRect(ox, oy + 40, 64, 2);
      // A shelf of bottles.
      x.fillStyle = "#4a2c18";
      x.fillRect(ox + 4, oy + 26, 56, 3);
      for (let i = 0; i < 9; i++) {
        x.fillStyle = ["#3a7a3a", "#8a3a1a", "#c9a23a", "#2a4a8a", "#e8e0d0"][Math.floor(rnd() * 5)];
        x.fillRect(ox + 6 + i * 6, oy + 18 + Math.floor(rnd() * 3), 3, 8);
      }
      // A poster.
      x.fillStyle = ["#d8231f", "#2e7ab8", "#e8a22a"][Math.floor(rnd() * 3)];
      x.fillRect(ox + 20, oy + 3, 22, 13);
      x.fillStyle = "#f4ead2";
      x.fillRect(ox + 23, oy + 6, 16, 2);
      x.fillRect(ox + 23, oy + 10, 10, 2);
    });
    // The old city's patterned floor tiles.
    tile(TILE.barFloor, (ox, oy) => {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          x.fillStyle = (r + c) % 2 ? "#2a2a30" : "#e8e2d4";
          x.fillRect(ox + c * 8, oy + r * 8, 8, 8);
          x.fillStyle = "#b8412e";
          if ((r + c) % 2 === 0) x.fillRect(ox + c * 8 + 3, oy + r * 8 + 3, 2, 2);
        }
    });
    // Terracotta on the rooftop terraces.
    tile(TILE.terrace, (ox, oy) => {
      x.fillStyle = "#6a3424";
      x.fillRect(ox, oy, 64, 64);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const v = rnd();
          x.fillStyle = hex(178 + v * 30, 92 + v * 20, 58 + v * 14);
          x.fillRect(ox + c * 16 + 1, oy + r * 16 + 1, 14, 14);
        }
      noise(ox, oy, 90, ["#9a5034", "#c07048"]);
    });
    // Floorboards, for looking into houses from above.
    tile(TILE.woodFloor, (ox, oy) => {
      for (let i = 0; i < 8; i++) {
        const v = rnd();
        x.fillStyle = hex(120 + v * 30, 82 + v * 20, 50 + v * 12);
        x.fillRect(ox, oy + i * 8, 64, 8);
        x.fillStyle = "#3a2414";
        x.fillRect(ox, oy + i * 8 + 7, 64, 1);
        x.fillRect(ox + Math.floor(rnd() * 64), oy + i * 8, 1, 7);
      }
    });
    roof(TILE.roof, "#c9c4b8", ["#b8b2a4", "#d6d1c6", "#aaa496", "#bfb9ab"]);
    roof(TILE.roofPainted, "#b0543e", ["#a04a36", "#c0654c", "#984434", "#b85c46"]);
  });
}

// The front of San José church: white plaster, stone trim, a great door.
export function churchTexture() {
  return canvasTexture(128, 128, (x) => {
    const rnd = mulberry32(9);
    x.fillStyle = "#f2ede2";
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      x.fillStyle = rnd() < 0.5 ? "#e4ddce" : "#fbf8f1";
      x.fillRect(rnd() * 128, rnd() * 128, 1, 1);
    }
    x.fillStyle = "#c8b890";
    for (const px of [4, 36, 88, 120]) x.fillRect(px, 20, 5, 108);
    x.fillRect(0, 60, 128, 4);
    x.fillRect(0, 16, 128, 5);
    x.fillStyle = "#b8a67a";
    x.fillRect(48, 70, 32, 58);
    x.fillStyle = "#3a2414";
    x.fillRect(52, 80, 24, 48);
    x.beginPath();
    x.arc(64, 80, 12, Math.PI, 0);
    x.fill();
    x.fillStyle = "#2a190e";
    x.fillRect(63, 80, 2, 48);
    x.fillStyle = "#b8a67a";
    x.beginPath();
    x.arc(64, 38, 10, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#2a2440";
    x.beginPath();
    x.arc(64, 38, 7, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "rgba(255,180,90,0.5)";
    x.fillRect(62, 35, 4, 6);
    for (const px of [18, 102]) {
      x.fillStyle = "#b8a67a";
      x.fillRect(px - 7, 78, 14, 26);
      x.fillStyle = "#231e30";
      x.fillRect(px - 5, 80, 10, 22);
    }
  });
}

// The Cathedral of San Juan's front: cream plaster, pilasters, a tall door
// and a round window, a touch grander than San José.
export function cathedralTexture() {
  return canvasTexture(80, 128, (x) => {
    const rnd = mulberry32(19);
    x.fillStyle = "#f3eadb";
    x.fillRect(0, 0, 80, 128);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = rnd() < 0.5 ? "#e6dac6" : "#fbf6ec";
      x.fillRect(rnd() * 80, rnd() * 128, 1, 1);
    }
    x.fillStyle = "#d8c6a0";
    for (const px of [3, 22, 55, 74]) x.fillRect(px, 14, 4, 114);
    x.fillRect(0, 10, 80, 5);
    x.fillRect(0, 62, 80, 4);
    x.fillStyle = "#c7b184";
    x.fillRect(28, 70, 24, 58);
    x.fillStyle = "#3a2414";
    x.fillRect(31, 80, 18, 48);
    x.beginPath();
    x.arc(40, 80, 9, Math.PI, 0);
    x.fill();
    x.fillStyle = "#c7b184";
    x.beginPath();
    x.arc(40, 38, 11, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#2a2440";
    x.beginPath();
    x.arc(40, 38, 8, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "rgba(255,180,90,0.5)";
    x.fillRect(38, 35, 4, 6);
    for (const px of [12, 66]) {
      x.fillStyle = "#c7b184";
      x.fillRect(px - 6, 30, 12, 22);
      x.fillStyle = "#231e30";
      x.fillRect(px - 4, 32, 8, 18);
      x.fillStyle = "#c7b184";
      x.fillRect(px - 6, 80, 12, 24);
      x.fillStyle = "#231e30";
      x.fillRect(px - 4, 82, 8, 20);
    }
  });
}

// A bar's neon sign, glowing over its door.
export function neonTexture(text: string, color: string) {
  return canvasTexture(128, 32, (x) => {
    x.fillStyle = "#120a10";
    x.fillRect(0, 0, 128, 32);
    x.strokeStyle = color;
    x.lineWidth = 2;
    x.strokeRect(3, 3, 122, 26);
    x.shadowColor = color;
    x.shadowBlur = 6;
    x.fillStyle = "#fff6f0";
    x.font = "bold italic 17px serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, 64, 17);
    x.fillStyle = color;
    x.globalAlpha = 0.6;
    x.fillText(text, 64, 17);
  });
}

export function perkTexture(name: string, color: string) {
  return canvasTexture(64, 128, (x) => {
    x.fillStyle = "#15101c";
    x.fillRect(0, 0, 64, 128);
    x.fillStyle = color;
    x.fillRect(3, 3, 58, 122);
    x.fillStyle = "#15101c";
    x.fillRect(6, 38, 52, 60);
    x.fillStyle = "#fff8e6";
    x.font = "bold 11px monospace";
    x.textAlign = "center";
    const words = name.toUpperCase().split(" ");
    words.forEach((w, i) => x.fillText(w, 32, 16 + i * 12));
    // A bottle.
    x.fillStyle = color;
    x.fillRect(26, 58, 12, 30);
    x.fillRect(29, 46, 6, 12);
    x.fillStyle = "#fff8e6";
    x.fillRect(27, 66, 10, 8);
    x.fillStyle = "#15101c";
    x.fillRect(18, 104, 28, 14);
  });
}

export function signTexture(text: string, fg: string, bg: string, w = 128, h = 32) {
  return canvasTexture(w, h, (x) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = fg;
    x.lineWidth = 2;
    x.strokeRect(2, 2, w - 4, h - 4);
    x.fillStyle = fg;
    x.font = `bold ${Math.round(h * 0.45)}px monospace`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2 + 1);
  });
}

// A wall buy: the gun's outline in chalk, with its name and price.
export function chalkTexture(id: WeaponId) {
  const def = WEAPONS[id];
  return canvasTexture(128, 64, (x) => {
    x.clearRect(0, 0, 128, 64);
    x.strokeStyle = "rgba(240,240,225,0.9)";
    x.fillStyle = "rgba(240,240,225,0.18)";
    x.lineWidth = 2;
    const L = def.look.long * 120;
    const x0 = 64 - L / 2;
    x.beginPath();
    x.rect(x0, 14, L * 0.55, 10);
    x.moveTo(x0 + L * 0.55, 18);
    x.lineTo(x0 + L, 18);
    x.moveTo(x0 + L * 0.45, 24);
    x.lineTo(x0 + L * 0.42, 36);
    x.lineTo(x0 + L * 0.35, 36);
    x.lineTo(x0 + L * 0.37, 24);
    if (def.look.wood) {
      x.moveTo(x0, 16);
      x.lineTo(x0 - 16, 22);
      x.lineTo(x0 - 16, 30);
      x.lineTo(x0, 24);
    }
    x.stroke();
    x.fill();
    x.fillStyle = "rgba(240,240,225,0.95)";
    x.font = "bold 11px monospace";
    x.textAlign = "center";
    x.fillText(def.name.toUpperCase(), 64, 50);
    x.fillStyle = "rgba(255,215,90,0.95)";
    x.fillText(String(def.cost), 64, 61);
  });
}

export function glowTexture(inner: string) {
  return canvasTexture(32, 32, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, inner);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  });
}

export function flashTexture() {
  return canvasTexture(32, 32, (x) => {
    x.translate(16, 16);
    for (let i = 0; i < 7; i++) {
      x.rotate((Math.PI * 2) / 7);
      x.fillStyle = i % 2 ? "rgba(255,210,120,0.9)" : "rgba(255,250,210,1)";
      x.beginPath();
      x.moveTo(-3, 0);
      x.lineTo(0, -15 + (i % 3) * 3);
      x.lineTo(3, 0);
      x.fill();
    }
    x.fillStyle = "#fffbe8";
    x.beginPath();
    x.arc(0, 0, 5, 0, Math.PI * 2);
    x.fill();
  });
}

// Power-up icons, drawn in COD green-gold.
export function powerTexture(kind: "ammo" | "insta" | "double" | "nuke") {
  return canvasTexture(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = "#ffd84a";
    x.strokeStyle = "#5a3a00";
    x.lineWidth = 3;
    if (kind === "double") {
      x.font = "bold 34px monospace";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.strokeText("x2", 32, 34);
      x.fillText("x2", 32, 34);
    } else if (kind === "ammo") {
      x.fillRect(12, 22, 40, 28);
      x.strokeRect(12, 22, 40, 28);
      x.fillStyle = "#5a3a00";
      for (let i = 0; i < 5; i++) x.fillRect(17 + i * 7, 10, 4, 14);
    } else if (kind === "insta") {
      x.beginPath();
      x.arc(32, 28, 18, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillRect(22, 40, 20, 14);
      x.fillStyle = "#5a3a00";
      x.fillRect(22, 24, 7, 8);
      x.fillRect(35, 24, 7, 8);
      x.fillRect(28, 44, 2, 10);
      x.fillRect(34, 44, 2, 10);
    } else {
      x.beginPath();
      x.arc(32, 36, 17, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillRect(28, 10, 8, 12);
      x.fillStyle = "#ff6a2a";
      x.fillRect(30, 4, 4, 6);
    }
  });
}
