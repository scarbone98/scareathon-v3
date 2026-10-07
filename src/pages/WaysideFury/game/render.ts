import { HEIGHT, WIDTH, type GameState } from "./sim";
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private idle = new Image();
  private run = new Image();
  constructor(canvas: HTMLCanvasElement) {
    canvas.width = WIDTH; canvas.height = HEIGHT;
    this.ctx = canvas.getContext("2d")!;
    this.idle.src = "/royale/joe_idle.png";
    this.run.src = "/mystery-crypt/run_joe.png";
  }
  draw(s: GameState) {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#162d32"; c.fillRect(0, 0, WIDTH, HEIGHT);
    for (let y = 32; y < HEIGHT; y += 16) for (let x = 0; x < WIDTH; x += 16) {
      c.fillStyle = (x + y) % 32 ? "#304648" : "#2b4143";
      c.fillRect(x + 1, y + 1, 14, 14);
      c.fillStyle = "#405657"; c.fillRect(x + 2, y + 2, 3, 1);
    }
    c.fillStyle = "#111d26"; c.fillRect(0, 0, WIDTH, 32);
    c.fillStyle = "#f5b65e"; c.font = "10px monospace"; c.fillText("WAYSIDE // TRAINING YARD", 12, 19);
    c.fillStyle = "#101d27"; c.fillRect(s.x - 8, s.y - 3, 16, 6);
    const image = s.moving ? this.run : this.idle;
    const frame = Math.floor(s.time * (s.moving ? 9 : 5)) % (s.moving ? 4 : 6);
    if (image.complete && image.naturalWidth) {
      c.save(); c.translate(Math.round(s.x), Math.round(s.y));
      if (s.faceX < 0) c.scale(-1, 1);
      c.drawImage(image, frame * 16, 0, 16, 24, -8, -24, 16, 24); c.restore();
    }
    c.fillStyle = "#fff0c8"; c.fillText("JOE", Math.round(s.x - 9), Math.round(s.y + 12));
  }
}
