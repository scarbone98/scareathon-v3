import { useState } from 'react';
import { HeroPortrait } from '../../HeroPortrait';
import { QUESTS, questProgress, questRewardsSummary, questStatus, type HubQuestSave, type QuestContext, type QuestDefinition, type QuestStatus } from './quests';
import './quests.css';

export interface QuestLogProps {
  save: HubQuestSave; context: QuestContext; onAccept: (id: string) => void;
  onClaim: (id: string) => void; onBack: () => void; canAct?: (id: string) => boolean;
  cosmetic?: string | null; onCosmetic?: (id: string | null) => void;
}
export interface QuestDialogueProps extends QuestLogProps {
  questId: string; embedded?: boolean; backLabel?: string;
}
const statusLabel: Record<QuestStatus, string> = { available: 'New request', active: 'In progress', ready: 'Ready to deliver', claimed: 'Completed' };
function JournalIcon() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M11 6h25a4 4 0 0 1 4 4v32H13a5 5 0 0 1-5-5V11a5 5 0 0 1 3-5Z" fill="currentColor" opacity=".14"/><path d="M13 6h23a4 4 0 0 1 4 4v32H13a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5Zm0 0v26m-5 5a5 5 0 0 1 5-5h27M20 15h12m-12 7h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function NpcPortrait({ quest }: { quest: QuestDefinition }) {
  return <span className={`wf-quest-portrait ${quest.npc.hero ? 'wf-quest-hero' : ''}`} aria-hidden="true">
    {quest.npc.hero ? <HeroPortrait id={quest.npc.hero} avatar={null} /> : <span>{quest.npc.name.slice(0, 1)}</span>}
  </span>;
}
function QuestDialogueContent({ questId, save, context, onAccept, onClaim, onBack, embedded = false, backLabel, canAct }: QuestDialogueProps) {
  const [page, setPage] = useState(0);
  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return null;
  const status = questStatus(save, quest.id, context), progress = questProgress(save, quest, context);
  const lines = status === 'available' ? quest.dialogue : [status === 'claimed' || status === 'ready' ? quest.thanks : quest.reminder];
  const currentPage = Math.min(page, lines.length - 1), lastPage = currentPage === lines.length - 1;
  const permitted = canAct?.(quest.id) ?? true;
  const fetch = quest.objective.type === 'fetch' ? quest.objective : null;
  return <section className={embedded ? 'wf-quest-conversation' : 'wf-overlay wf-quest-dialogue'} aria-label={`Talk to ${quest.npc.name}`}>
    <div className="wf-quest-conversation-content">
      <header className="wf-quest-speaker"><NpcPortrait quest={quest} /><div><p className="wf-eyebrow">{quest.npc.role}</p><h2>{quest.npc.name}</h2></div><span className={`wf-quest-status wf-quest-${status}`}>{statusLabel[status]}</span></header>
      <p className="wf-quest-speech" aria-live="polite">“{lines[currentPage]}”</p>
      <div className="wf-quest-detail"><p className="wf-eyebrow">{fetch ? 'DELIVERY REQUEST' : 'FIELD REQUEST'}</p><h3>{quest.title}</h3><p>{quest.description}</p>
        {status !== 'available' && <div className="wf-quest-progress"><div><span>{quest.objective.label}</span><strong>{progress} / {quest.objective.amount}</strong></div><progress aria-label={quest.objective.label} max={quest.objective.amount} value={progress} /></div>}
        {fetch && status !== 'claimed' && <p className="wf-quest-consumption">Delivery consumes {fetch.amount} {fetch.currency}. Your balance: {fetch.currency === 'candy' ? context.candy : context.inventory?.[fetch.currency] ?? 0}.</p>}
        <p className="wf-quest-rewards"><span aria-hidden="true">✦</span><span><small>REWARD</small>{questRewardsSummary(quest)}</span></p>
      </div>
      {!permitted && (status === "available" || status === "ready") && <p className="wf-small">Meet {quest.npc.name} in Wayside to {status === "ready" ? "deliver this request" : "accept this request"}.</p>}
      <footer className="wf-quest-dialogue-actions">
        {!lastPage ? <button onClick={() => setPage(currentPage + 1)}>Next <span aria-hidden="true">›</span></button>
          : status === 'available' ? <button disabled={!permitted} onClick={() => onAccept(quest.id)}>Accept quest</button>
          : status === 'ready' ? <button disabled={!permitted} onClick={() => onClaim(quest.id)}>{fetch ? `Deliver ${fetch.amount} ${fetch.currency}` : 'Claim reward'}</button>
          : <button onClick={onBack}>Continue <span aria-hidden="true">›</span></button>}
        {(status === 'available' || status === 'ready' || !lastPage) && <button className="wf-secondary" onClick={onBack}>{backLabel ?? (embedded ? 'Back to log' : 'Back to Wayside')}</button>}
        {lines.length > 1 && <span className="wf-quest-page" aria-label={`Dialogue ${currentPage + 1} of ${lines.length}`}>{lines.map((_, i) => <span key={i} className={i === currentPage ? 'wf-quest-page-current' : ''} />)}</span>}
      </footer>
    </div>
  </section>;
}
/** Shared NPC dialogue for the canvas hub and quest-log detail pane. */
export function QuestDialogue(props: QuestDialogueProps) {
  return <QuestDialogueContent key={props.questId} {...props} />;
}
export function QuestLog({ save, context, onAccept, onClaim, onBack, canAct, cosmetic, onCosmetic }: QuestLogProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'claimed'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = QUESTS.filter(q => ['active', 'ready'].includes(questStatus(save, q.id, context))).length;
  const completed = QUESTS.filter(q => questStatus(save, q.id, context) === 'claimed').length;
  const visible = QUESTS.filter(q => filter === 'all' || (filter === 'active' ? ['active', 'ready'].includes(questStatus(save, q.id, context)) : questStatus(save, q.id, context) === 'claimed'));
  return <div className="wf-overlay wf-quest-log" aria-label="Quest log">
    <div className="wf-quest-log-content">
      <header className="wf-quest-log-header"><div className="wf-quest-book"><JournalIcon /></div><div><p className="wf-eyebrow">WAYSIDE REQUESTS</p><h2>Quest log</h2><p>{active} in progress <span aria-hidden="true">·</span> {completed} / {QUESTS.length} completed</p></div><button className="wf-secondary" onClick={onBack}>Back to pause</button></header>
      <div className="wf-quest-tabs" role="group" aria-label="Filter quests">{(['all', 'active', 'claimed'] as const).map(value => <button key={value} className="wf-secondary" aria-pressed={value === filter} onClick={() => { setFilter(value); setSelectedId(null); }}>{value === 'all' ? 'All requests' : value === 'active' ? 'In progress' : 'Completed'}</button>)}</div>
      {!!save.cosmetics.length && onCosmetic && <div className="wf-quest-cosmetics" aria-label="Quest cosmetics"><span>Earned looks</span>{save.cosmetics.map(id => <button className="wf-secondary" key={id} aria-pressed={cosmetic === id} onClick={() => onCosmetic(cosmetic === id ? null : id)}>{id === "bbq-apron" ? "BBQ apron" : "Station scarf"}{cosmetic === id ? " · Wearing" : ""}</button>)}</div>}
      <div className={`wf-quest-layout ${selectedId ? 'wf-quest-has-detail' : ''}`}>
        <div className="wf-quest-list" aria-label="Wayside NPC requests">
          {visible.map(quest => {
            const status = questStatus(save, quest.id, context), progress = questProgress(save, quest, context);
            return <button key={quest.id} className={`wf-quest-card wf-quest-${status}`} aria-pressed={selectedId === quest.id} onClick={() => setSelectedId(quest.id)}>
              <NpcPortrait quest={quest} /><span className="wf-quest-card-text"><span className="wf-quest-card-byline">{quest.npc.name} <span className="wf-quest-status">{statusLabel[status]}</span></span><strong>{quest.title}</strong><small>{quest.objective.type === 'fetch' ? `Deliver ${quest.objective.amount} ${quest.objective.currency}` : quest.objective.label}</small>
                {status !== 'available' && <progress aria-label={`${quest.title} progress`} max={quest.objective.amount} value={progress} />}</span><span className="wf-quest-card-chevron" aria-hidden="true">{status === 'claimed' ? '✓' : '›'}</span>
            </button>;
          })}
          {visible.length === 0 && <p className="wf-quest-empty">{filter === 'active' ? 'No requests underway. Meet the neighbors in Wayside to get started.' : 'Your completed requests will appear here.'}</p>}
        </div>
        {selectedId ? <QuestDialogue questId={selectedId} save={save} context={context} onAccept={onAccept} onClaim={onClaim} onBack={() => setSelectedId(null)} canAct={canAct} embedded />
          : <aside className="wf-quest-log-note"><JournalIcon /><h3>A little help goes a long way.</h3><p>Talk to the people around Wayside. Track their requests here, then return with good news.</p><p>Quest progress and rewards belong to your character, including in co-op.</p><small>Cosmetic rewards change your look. Chips can be equipped in the character sheet.</small></aside>}
      </div>
    </div>
  </div>;
}
