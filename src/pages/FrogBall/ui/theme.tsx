// Constants shared by Frog Ball's menus and HUD.

export const WORLD_COLORS = ["#ff7fbf", "#ffd23f", "#45e3ff", "#b58cff", "#ff4fd8"];

export const RAINBOW: [string, string, string][] = [
  ["#ff5fa8", "#ffa8d0", "#a8205e"],
  ["#ffd23f", "#fff09a", "#c2560a"],
  ["#8cff5a", "#d2ffb0", "#2f9a3c"],
  ["#45e3ff", "#b8f6ff", "#1f6fb0"],
  ["#b58cff", "#e0d0ff", "#5a2fa8"],
];

// Zero-padded arcade score.
export const pad = (n: number, width = 7) => String(Math.max(0, Math.floor(n))).padStart(width, "0");

const tri = (dir: "up" | "down" | "left" | "right") => <span className={`fb-tri fb-tri-${dir}`} />;

// Key caps for the control hints along the bottom of the menus.
export const KEYS = {
  updown: (
    <span className="fb-key gap-1">
      {tri("up")}
      {tri("down")}
    </span>
  ),
  leftright: (
    <span className="fb-key gap-1">
      {tri("left")}
      {tri("right")}
    </span>
  ),
  ok: <span className="fb-key">ENTER</span>,
  back: <span className="fb-key">ESC</span>,
};
