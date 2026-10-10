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
