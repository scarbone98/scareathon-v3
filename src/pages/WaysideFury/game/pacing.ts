import { CHAPTERS, getMap } from './campaign.ts';
import type { GameState } from './sim.ts';

export function chapterGoal(s: GameState) {
  const done = (id: string) => s.clearedRooms.includes(id) || s.campaignMilestones.includes(id)
    || !!s.coop?.worldClearedRooms?.includes(id) || !!s.coop?.worldCampaignMilestones?.includes(id);
  const chapter = CHAPTERS.find(c => !done(c.completionMilestone)) ?? CHAPTERS[CHAPTERS.length-1];
  const rooms = chapter.mapIds.filter(id => (getMap(id)?.spawns.length ?? 0) > 0);
  const complete = done(chapter.completionMilestone);
  const cleared = complete ? rooms.length : rooms.filter(done).length;
  // The completion milestone owns the last segment, so clearing optional rooms
  // can never claim an unlock before the chapter's actual ending.
  const total = rooms.length + 1, value = complete ? total : cleared;
  const next = CHAPTERS.find(c => c.number === chapter.number+1);
  return { chapter: chapter.number, name: chapter.name, value, total,
    next: complete ? 'All available chapters cleared' : chapter.number === 5 || next?.number === 5 ? 'Finale route · coming soon' : next?.name ?? 'Campaign complete' };
}

// Renderer-owned goal strip; no changes to HUD, settings or onboarding files.
export class ChapterGoalStrip {
  private root = document.createElement('section');
  private title = document.createElement('div');
  private meter = document.createElement('progress');
  private next = document.createElement('div');
  private signature = '';
  constructor(canvas: HTMLCanvasElement) {
    this.root.hidden=true; this.root.className='wf-chapter-goal'; this.root.setAttribute('aria-label','Chapter progress');
    this.root.style.cssText='position:absolute;top:calc(env(safe-area-inset-top, 0px) + 128px);left:50%;transform:translateX(-50%);width:min(280px,72vw);padding:6px 10px;background:rgba(14,22,29,.88);color:#fff1c8;border-radius:8px;font:12px/1.35 system-ui;pointer-events:none;z-index:2';
    this.meter.style.cssText='display:block;width:100%;height:6px;margin:4px 0;accent-color:#ffd16d';
    this.meter.setAttribute('aria-label','Chapter progress');
    this.root.append(this.title,this.meter,this.next); canvas.insertAdjacentElement('afterend',this.root);
  }
  update(s: GameState) {
    this.root.hidden=!!s.opening || !!s.training || !!s.overlay || !!s.dialogue || !!s.film || ['prologue','shift','dead','test'].includes(s.scene);
    if(this.root.hidden) return;
    const goal=chapterGoal(s), signature=JSON.stringify(goal);
    if(signature===this.signature) return; this.signature=signature;
    this.title.textContent=`Chapter ${goal.chapter} · ${goal.value}/${goal.total}`;
    this.title.title=goal.name; this.meter.max=goal.total; this.meter.value=goal.value;
    this.next.textContent=`Next unlock: ${goal.next}`;
  }
  dispose() { this.root.remove(); }
}
