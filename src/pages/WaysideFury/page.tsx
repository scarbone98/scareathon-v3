import { useEffect, useRef, useState } from "react";
import { GameController } from "./game/controller";
import "./style.css";
export default function WaysideFury() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<GameController | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const game = new GameController(canvas.current!); controller.current = game;
    return () => { game.dispose(); controller.current = null; };
  }, []);
  return <main className="wf-shell">
    <div className="wf-stage"><canvas ref={canvas} aria-label="Wayside Fury game" /></div>
    {!playing ? <div className="wf-overlay wf-menu">
      <p className="wf-eyebrow">8 BIT EVIL RETURNS PRESENTS</p>
      <h1>WAYSIDE<br /><span>FURY</span></h1>
      <p>Five years later, the real evil arrives.</p>
      <button onClick={() => { controller.current?.start(); setPlaying(true); }}>Begin adventure</button>
      <p className="wf-small">WASD / arrows to move • Joe's training yard</p>
    </div> : <><div className="wf-topbar"><span>CHAPTER 1 · TRAINING YARD</span><button onClick={() => { controller.current?.setPaused(true); setPlaying(false); }}>Menu</button></div>
      <div className="wf-test-controls">{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([x, y, label]) => <button key={label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); controller.current?.setTouch({x, y}); }} onPointerUp={() => controller.current?.setTouch({x: 0, y: 0})} onPointerCancel={() => controller.current?.setTouch({x: 0, y: 0})}>{label}</button>)}</div></>}
  </main>;
}
