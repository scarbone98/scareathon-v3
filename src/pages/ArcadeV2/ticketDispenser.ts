// The ticket dispenser bolted on under the marquee: a little steel box with a red LED
// counter and a mouth at the bottom. A run that paid out feeds its tickets out of the mouth
// in one perforated strip that curls over and hangs down the cabinet's face, counting up as
// it goes; then the strip tears off and drops away. Shared by the arcade and Wayside
// Station's cabinet (only the arcade's ever pays out).
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { CABINET_FONT } from "./cabinetFinish.ts";
import { canvasFont, whenFontReady } from "./arcadeFonts.ts";
import { playStatic, playTicketFeed, playTicketGlitch, playTicketTear, playWhoosh } from "./arcadeSounds.ts";

// Its height and depth as a share of its width
export const DISPENSER_ASPECT = 0.34;

const FEED_RATE = 9; // tickets a second, like the real thing's chatter
const MOST_SHOWN = 9; // the strip's longest; a bigger win counts up faster instead
const HOLD = 1.1; // seconds the strip hangs there once it's all out
const GOLDEN_HOLD = 2.6; // (a golden ticket, longer: it's worth a look)
const FLY = 1.3; // seconds a collected ticket takes to sweep off to the left
const STAGGER = 0.06; // seconds between one ticket leaving and the next
const SHOW_TOTAL = 5; // seconds the counter keeps the total up after
const LED = "#ff2a1a";
const LED_OFF = "#3a0b08";
const TICKET = "#f2a03a";
const GOLD = "#ffcf4a";
const GLITCH = 0.5; // seconds a knock scrambles it for
const CRASH = 5; // seconds it sits on its blue screen before it comes back
const REBOOT = 0.45; // the last of which it flickers, coming back

export type TicketDispenser = {
  group: Group;
  // Feeds out this many tickets (added on to any still coming out); golden: one golden
  // ticket, worth that many
  dispense: (tickets: number, time: number, golden?: boolean) => void;
  // Knocked: the counter scrambles, the lamp stutters, the box rattles
  glitch: (time: number) => void;
  // Tapped while the strip's out: it's torn off and collected now (false: nothing to collect)
  collect: (time: number) => boolean;
  // Knocked once too often: its face goes to a blue screen for a while; tickets wait
  crash: (time: number) => void;
  isDown: (time: number) => boolean;
  update: (time: number) => void;
  dispose: () => void;
};

// Seven-segment digits, as which of a..g light (a top, then clockwise, g the middle)
const SEGMENTS = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];

function drawDigit(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: string) {
  const t = w * 0.2; // stroke
  const half = h / 2;
  const bars: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, half - 1.5 * t],
    c: [x + w - t, y + half + t / 2, t, half - 1.5 * t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + half + t / 2, t, half - 1.5 * t],
    f: [x, y + t, t, half - 1.5 * t],
    g: [x + t, y + half - t / 2, w - 2 * t, t],
  };
  Object.entries(bars).forEach(([segment, [bx, by, bw, bh]]) => {
    const on = lit.includes(segment);
    context.fillStyle = on ? LED : LED_OFF;
    context.shadowColor = LED;
    context.shadowBlur = on ? w * 0.35 : 0;
    context.fillRect(bx, by, bw, bh);
  });
  context.shadowBlur = 0;
}

// One ticket, both sides: notched ends, a perforated edge, ADMIT ONE (or, golden, GOLDEN
// TICKET on shining gold)
function ticketTexture(golden = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const paint = () => {
    const { width: w, height: h } = canvas;
    context.clearRect(0, 0, w, h);
    if (golden) {
      const shine = context.createLinearGradient(0, 0, w, h);
      shine.addColorStop(0, "#a8761a");
      shine.addColorStop(0.35, GOLD);
      shine.addColorStop(0.5, "#fff3b8");
      shine.addColorStop(0.65, GOLD);
      shine.addColorStop(1, "#a8761a");
      context.fillStyle = shine;
    } else context.fillStyle = TICKET;
    context.fillRect(0, 0, w, h);
    // Notches halfway along each long side (the strip's sides)
    context.globalCompositeOperation = "destination-out";
    [0, w].forEach((x) => {
      context.beginPath();
      context.arc(x, h / 2, h * 0.14, 0, Math.PI * 2);
      context.fill();
    });
    context.globalCompositeOperation = "source-over";
    // The perforation to the next ticket, along the bottom edge
    context.fillStyle = "rgba(90, 40, 10, 0.55)";
    for (let x = 6; x < w; x += 14) context.fillRect(x, h - 5, 7, 3);
    context.strokeStyle = "rgba(120, 50, 10, 0.6)";
    context.lineWidth = 4;
    context.strokeRect(26, 14, w - 52, h - 30);
    context.fillStyle = "#6b2408";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = canvasFont(CABINET_FONT, 30);
    context.fillText(golden ? "GOLDEN TICKET" : "ADMIT ONE", w / 2, h / 2 - 12, w - 70);
    context.font = canvasFont(CABINET_FONT, 15);
    context.fillText(golden ? "★ SA-86 · WAYSIDE ★" : "SA-86 · WAYSIDE", w / 2, h / 2 + 22, w - 70);
    texture.needsUpdate = true;
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  paint();
  whenFontReady(CABINET_FONT).then(paint);
  return texture;
}

export function createTicketDispenser(width: number): TicketDispenser {
  const height = width * DISPENSER_ASPECT;
  const depth = width * DISPENSER_ASPECT;
  const group = new Group();

  // The steel box, the faceplate printed on its front
  const steel = new MeshStandardMaterial({ color: new Color("#77736d"), metalness: 0.6, roughness: 0.38 });
  const caseGeometry = new BoxGeometry(width, height, depth);
  group.add(new Mesh(caseGeometry, steel));
  const face = document.createElement("canvas");
  face.width = 512;
  face.height = Math.round(512 * DISPENSER_ASPECT);
  const faceContext = face.getContext("2d")!;
  const faceTexture = new CanvasTexture(face);
  faceTexture.colorSpace = SRGBColorSpace;
  const faceMaterial = new MeshBasicMaterial({ map: faceTexture });
  const faceGeometry = new PlaneGeometry(width * 0.96, height * 0.9);
  const faceMesh = new Mesh(faceGeometry, faceMaterial);
  faceMesh.position.set(0, height * 0.02, depth / 2 + 0.0005);
  group.add(faceMesh);

  // The mouth: a black lip along the bottom front the strip comes out of
  const mouthMaterial = new MeshStandardMaterial({ color: new Color("#141114"), roughness: 0.5 });
  const mouthGeometry = new BoxGeometry(width * 0.5, height * 0.16, depth * 0.3);
  const mouth = new Mesh(mouthGeometry, mouthMaterial);
  const mouthY = -height / 2 - height * 0.02;
  mouth.position.set(0, mouthY, depth / 2 - depth * 0.05);
  group.add(mouth);
  const lipZ = depth / 2 + depth * 0.1;

  // shown: the counter's number (null: dashes); blink: the total flashing once it's all out
  let shown: number | null = null;
  let lampOn = false;
  let scrambled = false; // knocked: garbage on the counter
  // Crashed: the blue screen, and how far its (made-up) dump has got; or the black of rebooting
  let bsod: { percent: number } | "black" | null = null;
  const paintBlueScreen = (percent: number) => {
    const { width: w, height: h } = face;
    faceContext.fillStyle = "#1238b5";
    faceContext.fillRect(0, 0, w, h);
    faceContext.fillStyle = "#ffffff";
    faceContext.textAlign = "left";
    faceContext.textBaseline = "middle";
    faceContext.font = "700 96px Arial, sans-serif";
    faceContext.fillText(":(", 22, h * 0.48);
    faceContext.font = canvasFont(CABINET_FONT, 19);
    faceContext.fillText("YOUR DISPENSER RAN INTO", 130, h * 0.24, w - 150);
    faceContext.fillText("A PROBLEM AND NEEDS TO RESTART.", 130, h * 0.42, w - 150);
    faceContext.font = canvasFont(CABINET_FONT, 15);
    faceContext.fillText(`${percent}% COMPLETE`, 130, h * 0.62, w - 150);
    faceContext.fillStyle = "#c9d6ff";
    faceContext.font = canvasFont(CABINET_FONT, 12);
    faceContext.fillText("STOP CODE: TICKET_DISPENSER_FAULT", 130, h * 0.8, w - 150);
    faceTexture.needsUpdate = true;
  };
  const paintFace = () => {
    const { width: w, height: h } = face;
    if (bsod === "black") {
      faceContext.fillStyle = "#050505";
      faceContext.fillRect(0, 0, w, h);
      faceTexture.needsUpdate = true;
      return;
    }
    if (bsod) {
      paintBlueScreen(bsod.percent);
      return;
    }
    faceContext.fillStyle = "#26221f";
    faceContext.fillRect(0, 0, w, h);
    faceContext.strokeStyle = "#5d5850";
    faceContext.lineWidth = 6;
    faceContext.strokeRect(5, 5, w - 10, h - 10);
    // TICKETS, left
    faceContext.fillStyle = "#eadcc0";
    faceContext.textAlign = "left";
    faceContext.textBaseline = "middle";
    faceContext.font = canvasFont(CABINET_FONT, 38);
    faceContext.fillText("TICKETS", 28, h * 0.42, w * 0.46);
    faceContext.fillStyle = "#a09481";
    faceContext.font = canvasFont(CABINET_FONT, 15);
    faceContext.fillText("WIN · REDEEM AT COUNTER", 30, h * 0.72, w * 0.46);
    // The lamp beside it, lit while it's paying out
    faceContext.fillStyle = lampOn ? "#ffd23a" : "#4a3a10";
    faceContext.shadowColor = "#ffd23a";
    faceContext.shadowBlur = lampOn ? 18 : 0;
    faceContext.beginPath();
    faceContext.arc(w * 0.535, h * 0.45, 11, 0, Math.PI * 2);
    faceContext.fill();
    faceContext.shadowBlur = 0;
    // The LED counter, right: four digits in a dark window
    const windowLeft = w * 0.6;
    faceContext.fillStyle = "#0b0605";
    faceContext.fillRect(windowLeft, h * 0.16, w * 0.36, h * 0.68);
    const digitW = w * 0.06;
    const digitH = h * 0.48;
    const text = shown === null ? "" : String(Math.min(shown, 9999));
    for (let i = 0; i < 4; i += 1) {
      const char = text[text.length - 4 + i];
      const lit = scrambled
        ? "abcdefg".split("").filter(() => Math.random() < 0.45).join("")
        : shown === null
          ? "g"
          : char === undefined
            ? ""
            : SEGMENTS[Number(char)];
      drawDigit(faceContext, windowLeft + w * 0.025 + i * (digitW + w * 0.025), h * 0.26, digitW, digitH, lit);
    }
    faceTexture.needsUpdate = true;
  };
  paintFace();
  whenFontReady(CABINET_FONT).then(paintFace);

  // The strip: one plane per ticket, laid along a path out of the mouth (straight out, a
  // quarter turn over, then straight down), from the newest at the mouth to the oldest
  const ticketW = width * 0.4;
  const ticketH = ticketW * 0.5;
  const curl = ticketH * 0.9; // radius of the turn over
  const turn = (curl * Math.PI) / 2;
  const ticketMap = ticketTexture();
  const ticketMaterial = new MeshStandardMaterial({ map: ticketMap, side: DoubleSide, roughness: 0.8, transparent: true, alphaTest: 0.05 });
  ticketMaterial.emissive = new Color(TICKET).multiplyScalar(0.25);
  const goldMap = ticketTexture(true);
  const goldMaterial = new MeshStandardMaterial({ map: goldMap, side: DoubleSide, roughness: 0.35, metalness: 0.3, transparent: true, alphaTest: 0.05 });
  goldMaterial.emissive = new Color(GOLD).multiplyScalar(0.6);
  const ticketGeometry = new PlaneGeometry(ticketW, ticketH);
  const strip = new Group();
  group.add(strip);
  const tickets = Array.from({ length: MOST_SHOWN }, () => {
    const mesh = new Mesh(ticketGeometry, ticketMaterial);
    mesh.visible = false;
    strip.add(mesh);
    return { mesh, vx: 0, vy: 0, vz: 0, spin: 0, delay: 0 };
  });
  // Where a point `s` along the path is, and which way the paper faces there
  const place = (mesh: Mesh, s: number) => {
    const angle = Math.min(Math.max(s, 0) / curl, Math.PI / 2);
    const z = lipZ + curl * Math.sin(angle);
    const y = mouthY - curl * (1 - Math.cos(angle)) - Math.max(0, s - turn);
    mesh.position.set(0, y, s < 0 ? lipZ + s : z);
    mesh.rotation.set(angle - Math.PI / 2, 0, 0);
  };

  // What's coming out: `total` tickets won, `count` of them on the strip, fed `out` tickets'
  // length so far of the `end` it stops at; `doneAt`, when it got there
  let feed: { total: number; count: number; out: number; end: number; fed: number; doneAt: number; golden: boolean } | null = null;
  let tearAt = 0; // the strip tore off and is being collected
  let lastTotal = 0; // flashed on the counter for a while after
  let totalUntil = 0;
  let lastTime = 0;
  // Knocked: until when it's scrambled, and where it hangs when it's not rattling
  let glitchUntil = 0;
  let rest: Vector3 | null = null;
  const setOpacity = (opacity: number) => {
    ticketMaterial.opacity = opacity;
    goldMaterial.opacity = opacity;
  };

  // Torn off and collected: the counter keeps the total up a while; away they go
  const tearOff = (time: number) => {
    if (!feed) return;
    lastTotal = feed.total;
    totalUntil = time + SHOW_TOTAL;
    feed = null;
    tearAt = time;
    playTicketTear();
    playWhoosh();
    tickets.forEach((ticket, i) => {
      ticket.delay = i * STAGGER;
      ticket.vx = -0.25 - Math.random() * 0.1;
      ticket.vy = 0.22 + Math.random() * 0.12;
      ticket.vz = 0.12 + Math.random() * 0.08;
      ticket.spin = Math.random() * Math.PI * 2;
    });
  };
  // (Only once it's all out: tapping while it's still feeding just knocks the box)
  const collect = (time: number) => {
    if (!feed || feed.out < feed.end) return false;
    tearOff(time);
    return true;
  };

  const glitch = (time: number) => {
    rest ??= group.position.clone();
    glitchUntil = time + GLITCH;
    playTicketGlitch();
  };

  let crashUntil = 0;
  const isDown = (time: number) => time < crashUntil;
  const crash = (time: number) => {
    rest ??= group.position.clone();
    crashUntil = time + CRASH;
    glitchUntil = time + GLITCH;
    playTicketGlitch();
    playStatic();
  };

  const dispense = (won: number, time: number, golden = false) => {
    if (!(won > 0)) return;
    if (feed) {
      // Still coming out or hanging there: carry on with the extra
      feed.total += Math.round(won);
      feed.count = Math.min(feed.total, MOST_SHOWN);
      feed.end = Math.max(feed.end, feed.count);
      feed.doneAt = 0;
      return;
    }
    const total = Math.round(won);
    // A golden ticket comes out on its own
    // (pushed on out past the mouth until it hangs, face on)
    const count = golden ? 1 : Math.min(total, MOST_SHOWN);
    feed = { total, count, out: 0, end: Math.max(count, 2.6), fed: 0, doneAt: 0, golden };
    tearAt = 0;
    setOpacity(1);
    tickets.forEach((ticket, i) => {
      ticket.mesh.visible = false;
      ticket.mesh.material = golden && i === 0 ? goldMaterial : ticketMaterial;
    });
    lastTime = time;
  };

  const update = (time: number) => {
    const down = isDown(time);
    const dt = lastTime ? Math.min(time - lastTime, 0.05) : 0;
    lastTime = time;
    let counter: number | null = time < totalUntil && Math.floor(time * 2.5) % 2 === 0 ? lastTotal : null;
    let lamp = false;
    if (feed) {
      // Fed out at a steady rate, the counter keeping pace with the real total
      // (Crashed, it holds what's coming till it's back)
      feed.out = Math.min(feed.out + (down ? 0 : dt) * (feed.golden ? FEED_RATE / 3 : FEED_RATE), feed.end);
      if (Math.floor(feed.out) > feed.fed && feed.out <= feed.count) {
        feed.fed = Math.floor(feed.out);
        playTicketFeed();
      }
      counter = Math.round((Math.min(feed.out / feed.count, 1)) * feed.total);
      lamp = Math.floor(time * 10) % 2 === 0;
      // The first one out leads, furthest along; each after it one ticket further back,
      // the newest just poking out of the mouth
      tickets.forEach((ticket, i) => {
        const along = (feed!.out - i - 0.5) * ticketH;
        ticket.mesh.visible = i < feed!.count && along > -ticketH * 0.5;
        if (ticket.mesh.visible) place(ticket.mesh, along);
      });
      if (feed.out >= feed.end) {
        feed.doneAt ||= time;
        lamp = false;
        // All out: it hangs a moment, then it's torn off and collected
        if (!down && time - feed.doneAt > (feed.golden ? GOLDEN_HOLD : HOLD)) tearOff(time);
      }
    } else if (tearAt) {
      // Collected: off to the left one after another, the bottom one first, each lifting a
      // little, turning to face you and fluttering as it picks up speed; fading at the end
      const flight = FLY + STAGGER * MOST_SHOWN;
      tickets.forEach((ticket) => {
        if (!ticket.mesh.visible || time - tearAt < ticket.delay) return;
        ticket.vx -= 4.2 * dt;
        ticket.vy -= 0.35 * dt;
        ticket.mesh.position.x += ticket.vx * dt;
        ticket.mesh.position.y += ticket.vy * dt;
        ticket.mesh.position.z += ticket.vz * dt;
        ticket.mesh.rotation.x *= Math.exp(-dt * 5);
        ticket.mesh.rotation.z = Math.sin((time - tearAt) * 14 + ticket.spin) * 0.35;
      });
      const left = flight - (time - tearAt);
      setOpacity(Math.min(1, Math.max(0, left / (FLY * 0.3))));
      if (left <= 0) {
        tickets.forEach((ticket) => (ticket.mesh.visible = false));
        tearAt = 0;
      }
    }
    // Knocked: garbage on the counter, the lamp stuttering, the box rattling on its bolts
    const knocked = time < glitchUntil;
    if (knocked) lamp = Math.random() < 0.5;
    if (rest) {
      const shake = knocked ? ((glitchUntil - time) / GLITCH) * width * 0.012 : 0;
      group.position.set(rest.x + (Math.random() - 0.5) * shake, rest.y + (Math.random() - 0.5) * shake, rest.z);
      group.rotation.z = (Math.random() - 0.5) * shake * 1.5;
    }
    // Down: the blue screen, filling up, then a flicker of black as it reboots
    if (down) {
      const left = crashUntil - time;
      const next = left < REBOOT ? (Math.floor(time * 20) % 2 === 0 ? "black" : { percent: 100 }) : { percent: Math.min(100, Math.floor(((CRASH - left) / (CRASH - REBOOT)) * 100 / 5) * 5) };
      const same = next === "black" ? bsod === "black" : bsod !== null && bsod !== "black" && bsod.percent === next.percent;
      if (!same) {
        bsod = next;
        paintFace();
      }
      return;
    }
    if (bsod) {
      bsod = null;
      scrambled = false;
      paintFace();
    }
    if (knocked || scrambled || counter !== shown || lamp !== lampOn) {
      scrambled = knocked;
      shown = counter;
      lampOn = lamp;
      paintFace();
    }
  };

  return {
    group,
    dispense,
    glitch,
    collect,
    crash,
    isDown,
    update,
    dispose() {
      [caseGeometry, faceGeometry, mouthGeometry, ticketGeometry].forEach((geometry) => geometry.dispose());
      [steel, faceMaterial, mouthMaterial, ticketMaterial, goldMaterial].forEach((material) => material.dispose());
      [faceTexture, ticketMap, goldMap].forEach((texture) => texture.dispose());
    },
  };
}
