import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from "three";

// A little green-screen terminal beside the cartridge slot. It types out what
// the scanner reads off the picked cartridge, and shows a loading bar while
// one is plugged in.

const WIDTH = 256;
const HEIGHT = 160;
const LINE_HEIGHT = 25;
const CHARS_PER_SECOND = 70;
const PHOSPHOR = "#39ff6a";

export type SlotTerminal = {
  group: Group;
  // Type these lines out, replacing what's there
  print: (lines: string[]) => void;
  // "LOADING..." with a filling bar, until something else is printed
  loading: (title: string) => void;
  // A crash report, then REBOOTING with a bar that fills over `seconds`
  reboot: (seconds: number) => void;
  update: (time: number) => void;
  dispose: () => void;
};

export function createSlotTerminal(width: number, height: number, depth: number): SlotTerminal {
  const group = new Group();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  // A beige case with a dark bezel round the glass
  const caseMaterial = new MeshStandardMaterial({ color: new Color("#b9ab8e"), roughness: 0.6 });
  const bezelMaterial = new MeshStandardMaterial({ color: new Color("#141114"), roughness: 0.4 });
  const glassMaterial = new MeshBasicMaterial({ map: texture });
  const caseGeometry = new BoxGeometry(width, height, depth);
  const bezelGeometry = new BoxGeometry(width * 0.9, height * 0.84, depth * 0.1);
  const glassGeometry = new PlaneGeometry(width * 0.84, height * 0.74);
  group.add(new Mesh(caseGeometry, caseMaterial));
  const bezel = new Mesh(bezelGeometry, bezelMaterial);
  bezel.position.z = depth / 2;
  group.add(bezel);
  const glass = new Mesh(glassGeometry, glassMaterial);
  glass.position.z = depth / 2 + depth * 0.06;
  group.add(glass);

  let lines: string[] = [];
  let typedFrom = 0; // time the current lines started typing
  let loadingTitle: string | null = null;
  let rebootSeconds = 0; // while rebooting, how long it takes (0 when not)
  let lastKey = "";

  const paint = (time: number) => {
    const elapsed = Math.max(time - typedFrom, 0);
    if (rebootSeconds > 0) {
      paintReboot(time, elapsed);
      return;
    }
    const typed = Math.floor(elapsed * CHARS_PER_SECOND);
    const cursorOn = Math.floor(time * 2.5) % 2 === 0;
    const bar = loadingTitle !== null ? Math.min(Math.floor(elapsed * 6), 14) : 0;
    const dots = Math.floor(time * 3) % 4;
    // Only redraw when something visible changed
    const key = `${typed}|${cursorOn}|${bar}|${dots}`;
    if (key === lastKey) return;
    lastKey = key;

    context.fillStyle = "#021407";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = PHOSPHOR;
    context.shadowColor = PHOSPHOR;
    context.shadowBlur = 6;
    context.font = "700 18px ui-monospace, Menlo, Consolas, monospace";
    context.textBaseline = "top";
    let x = 10;
    let y = 10;
    if (loadingTitle !== null) {
      context.fillText(`> ${loadingTitle}`.slice(0, 20), x, y);
      y += LINE_HEIGHT * 1.4;
      context.fillText(`LOADING${".".repeat(dots)}`, x, y);
      y += LINE_HEIGHT * 1.4;
      // A bar of blocks filling up
      context.strokeStyle = PHOSPHOR;
      context.lineWidth = 2;
      context.strokeRect(x, y, 14 * 16 + 4, 20);
      for (let i = 0; i < bar; i += 1) context.fillRect(x + 4 + i * 16, y + 4, 12, 12);
    } else {
      // Type the lines out a character at a time, then a blinking cursor
      let left = typed;
      for (const line of lines) {
        const shown = line.slice(0, Math.max(left, 0));
        context.fillText(shown, x, y);
        left -= line.length;
        if (left < 0) {
          x += context.measureText(shown).width;
          break;
        }
        y += LINE_HEIGHT;
      }
      if (left >= 0) x = 10;
      if (cursorOn) context.fillRect(x + 1, y + 1, 10, 17);
    }
    context.shadowBlur = 0;
    // Scanlines
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let row = 0; row < HEIGHT; row += 3) context.fillRect(0, row, WIDTH, 1);
    texture.needsUpdate = true;
  };

  const CRASH = 1.4; // seconds of crash report before the reboot starts
  const paintReboot = (time: number, elapsed: number) => {
    const progress = Math.min(Math.max((elapsed - CRASH) / (rebootSeconds - CRASH - 0.3), 0), 1);
    const blink = Math.floor(time * 4) % 2 === 0;
    const key = `reboot|${elapsed < CRASH}|${blink}|${Math.floor(progress * 14)}|${Math.floor(time * 3) % 4}`;
    if (key === lastKey) return;
    lastKey = key;
    context.fillStyle = "#021407";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = PHOSPHOR;
    context.shadowColor = PHOSPHOR;
    context.shadowBlur = 6;
    context.font = "700 18px ui-monospace, Menlo, Consolas, monospace";
    context.textBaseline = "top";
    if (elapsed < CRASH) {
      if (blink) {
        context.fillText("*** FATAL ERROR ***", 10, 10);
        context.fillText("TILT DETECTED", 10, 10 + LINE_HEIGHT * 1.4);
      }
      context.fillText("CORE DUMPED", 10, 10 + LINE_HEIGHT * 2.8);
    } else {
      context.fillText(`> REBOOTING${".".repeat(Math.floor(time * 3) % 4)}`, 10, 10);
      const y = 10 + LINE_HEIGHT * 1.3;
      context.strokeStyle = PHOSPHOR;
      context.lineWidth = 2;
      context.strokeRect(10, y, 14 * 16 + 4, 20);
      for (let i = 0; i < Math.floor(progress * 14); i += 1) context.fillRect(14 + i * 16, y + 4, 12, 12);
      ["MEM CHECK... OK", "TAPE DRIVE.. OK", "SCANNER..... OK"].forEach((line, i) => {
        if (progress > 0.3 * (i + 1)) context.fillText(line, 10, y + LINE_HEIGHT * (1.3 + i));
      });
    }
    context.shadowBlur = 0;
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let row = 0; row < HEIGHT; row += 3) context.fillRect(0, row, WIDTH, 1);
    texture.needsUpdate = true;
  };

  const now = () => performance.now() / 1000;
  return {
    group,
    print(next) {
      lines = next.map((line) => line.toUpperCase());
      loadingTitle = null;
      rebootSeconds = 0;
      typedFrom = now();
      lastKey = "";
    },
    loading(title) {
      loadingTitle = title.toUpperCase();
      rebootSeconds = 0;
      typedFrom = now();
      lastKey = "";
    },
    reboot(seconds) {
      rebootSeconds = seconds;
      typedFrom = now();
      lastKey = "";
    },
    update: paint,
    dispose() {
      texture.dispose();
      [caseMaterial, bezelMaterial, glassMaterial].forEach((material) => material.dispose());
      [caseGeometry, bezelGeometry, glassGeometry].forEach((geometry) => geometry.dispose());
    },
  };
}
