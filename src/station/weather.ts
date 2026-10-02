import {
  BufferGeometry,
  CanvasTexture,
  BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from "three";

// The weather outside the station: now and then rain, fog or snow, over the tracks, past the
// platform's end and behind the station (where the transoms look out). Under the canopy it's
// always dry. Which it is changes every few hours, the same for everyone; ?weather=rain (or
// fog, snow, clear) picks one.

export type Weather = "clear" | "rain" | "fog" | "snow";

const SPELL_MS = 3 * 60 * 60 * 1000;
// (read as the station loads, before it tidies the address)
const ASKED = new URLSearchParams(window.location.search).get("weather");

export function weatherNow(now = Date.now()): Weather {
  if (ASKED === "clear" || ASKED === "rain" || ASKED === "fog" || ASKED === "snow") return ASKED;
  // A spell's weather, from a hash of which spell it is
  let h = Math.floor(now / SPELL_MS) * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  const roll = (h % 1000) / 1000;
  return roll < 0.5 ? "clear" : roll < 0.72 ? "rain" : roll < 0.88 ? "fog" : "snow";
}

// Where the station's walls are (from StationScene)
export type Outside = { wallZ: number; edgeZ: number; endX: number; trackZ: number };

// Over the line, where a train runs: kept clear while one's there, so nothing falls or
// drifts inside its cars
const onTheLine = (z: number, o: Outside) => Math.abs(z - o.trackZ) < 1.8;

// Somewhere outside: past the platform's edge, past its end, or behind the station
function outsideSpot(o: Outside): [number, number] {
  for (;;) {
    const x = -26 + Math.random() * 40;
    const z = o.wallZ - 7 + Math.random() * (o.edgeZ + 14 - o.wallZ + 7);
    if (z > o.edgeZ + 0.3 || x < o.endX - 0.3 || z < o.wallZ - 0.4) return [x, z];
  }
}

function mistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(190,200,215,0.9)");
    g.addColorStop(0.5, "rgba(170,180,195,0.4)");
    g.addColorStop(1, "rgba(160,170,185,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const TOP = 9;
const BOTTOM = -1;

export function buildWeather(weather: Weather, outside: Outside) {
  const group = new Group();
  // (trainHere: a train on the line by the platform, or the one you ride in on)
  let update: (t: number, reduced: boolean, trainHere: boolean) => void = () => {};

  if (weather === "rain") {
    // Streaks, slanting a little, falling fast
    const count = 1600;
    const spots = Array.from({ length: count }, () => outsideSpot(outside));
    const heights = spots.map(() => BOTTOM + Math.random() * (TOP - BOTTOM));
    const positions = new Float32Array(count * 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const clearOfTrain = spots.map(([, z]) => onTheLine(z, outside));
    const rain = new LineSegments(geometry, new LineBasicMaterial({ color: "#aab6cc", transparent: true, opacity: 0.75 }));
    rain.frustumCulled = false;
    group.add(rain);
    let last = 0;
    update = (t, reduced, trainHere) => {
      const dt = Math.min(t - last, 0.1);
      last = t;
      spots.forEach(([x, z], i) => {
        if (!reduced) heights[i] -= dt * 11;
        if (heights[i] < BOTTOM) heights[i] += TOP - BOTTOM;
        const y = trainHere && clearOfTrain[i] ? -100 : heights[i];
        positions.set([x, y, z, x + 0.05, y + 0.38, z], i * 6);
      });
      geometry.attributes.position.needsUpdate = true;
    };
  }

  if (weather === "snow") {
    // Flakes drifting down, swaying
    const count = 1100;
    const spots = Array.from({ length: count }, () => outsideSpot(outside));
    const heights = spots.map(() => BOTTOM + Math.random() * (TOP - BOTTOM));
    const phases = spots.map(() => Math.random() * Math.PI * 2);
    const positions = new Float32Array(count * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const clearOfTrain = spots.map(([, z]) => onTheLine(z, outside));
    const snow = new Points(geometry, new PointsMaterial({ color: "#f2f5fa", size: 4, sizeAttenuation: false }));
    snow.frustumCulled = false;
    group.add(snow);
    let last = 0;
    update = (t, reduced, trainHere) => {
      const dt = Math.min(t - last, 0.1);
      last = t;
      spots.forEach(([x, z], i) => {
        if (!reduced) heights[i] -= dt * (0.6 + (i % 5) * 0.08);
        if (heights[i] < BOTTOM) heights[i] += TOP - BOTTOM;
        const sway = reduced ? 0 : Math.sin(t * 0.8 + phases[i]) * 0.35;
        positions.set([x + sway, trainHere && clearOfTrain[i] ? -100 : heights[i], z + sway * 0.4], i * 3);
      });
      geometry.attributes.position.needsUpdate = true;
    };
  }

  if (weather === "fog") {
    // Banks of mist lying over the fields and the line, drifting slowly along
    const mist = mistTexture();
    const banks = Array.from({ length: 34 }, () => {
      const [x, z] = outsideSpot(outside);
      const bank = new Sprite(new SpriteMaterial({ map: mist, transparent: true, opacity: 0.16 + Math.random() * 0.12, depthWrite: false, fog: false }));
      const size = 7 + Math.random() * 7;
      bank.scale.set(size * 1.8, size * 0.6, 1);
      bank.position.set(x, -0.4 + Math.random() * 2.2, z);
      group.add(bank);
      // (only those along the line or behind the station drift; one past the platform's end
      // would drift onto it)
      const drifts = z > outside.edgeZ + 0.3 || z < outside.wallZ - 0.4;
      return { bank, x, speed: drifts ? 0.15 + Math.random() * 0.25 : 0, line: onTheLine(z, outside) };
    });
    update = (t, reduced, trainHere) => {
      banks.forEach(({ bank, x, speed, line }) => {
        bank.visible = !(trainHere && line);
        if (speed && !reduced) bank.position.x = -26 + ((x + 26 + t * speed) % 40);
      });
    };
  }

  group.userData.update = update;
  return group;
}
