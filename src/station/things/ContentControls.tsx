/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '../../fetchWithAuth';
import { useSession } from '../../pages/WaysideOnline/api';
import { useFeatures } from '../features';

export type ReportTarget = 'post' | 'lounge_chat' | 'monster_chat' | 'photo' | 'listing';
async function send(path: string, init?: RequestInit) {
  const response = await fetchWithAuth(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save this. Please try again.');
  return body;
}
export function useBlocks() {
  const features = useFeatures();
  const session = useSession();
  const query = useQuery({
    queryKey: ['user-blocks', session?.user.id],
    enabled: features.reports && Boolean(session),
    queryFn: async () => (await send('/user/blocks')).blocks as { userId: string }[],
    refetchInterval: 60_000,
  });
  return features.reports ? new Set(query.data?.map(block => block.userId) ?? []) : new Set<string>();
}
export default function ContentControls({ targetType, targetId, userId, onChange }: { targetType: ReportTarget; targetId?: string | null; userId?: string | null; onChange?: () => void }) {
  const features = useFeatures();
  const session = useSession();
  const client = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  if (!features.reports || !session || session.user.id === userId) return null;
  const act = async (path: string, method: string, body?: object) => {
    setBusy(true); setNotice('');
    try {
      await send(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      setNotice(method === 'PUT' ? 'Rider blocked. Manage blocks in Settings.' : 'Report sent. Thank you.');
      setReporting(false); setReason('');
      await client.invalidateQueries({ queryKey: ['user-blocks'] });
      onChange?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
    {targetId && <button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => setReporting(!reporting)}>Report</button>}
    {userId && <button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => void act(`/user/blocks/${userId}`, 'PUT')}>Block rider</button>}
    {reporting && <div className="w-full space-y-2">
      <label className="block">Reason<textarea className="mt-1 block w-full rounded border border-current/30 bg-black/10 p-2" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={2} /></label>
      <button type="button" className="underline" disabled={busy || !reason.trim()} onClick={() => void act('/content/reports', 'POST', { targetType, targetId, reason })}>Send report</button>
    </div>}
    {notice && <p className="w-full" role="status">{notice}</p>}
  </div>;
}
export function BlockedRiders() {
  const features = useFeatures();
  const blocks = useBlocks();
  const client = useQueryClient();
  const [error, setError] = useState('');
  if (!features.reports) return null;
  return <section><h3>Blocked riders</h3>
    <p>Their posts, chat and photos are hidden. They cannot send you mail.</p>
    {blocks.size === 0 && <p className="mt-2">No blocked riders.</p>}
    {[...blocks].map(id => <div key={id} className="mt-2 flex flex-wrap gap-2"><span className="break-all">{id}</span><button type="button" className="underline" onClick={() => void send(`/user/blocks/${id}`, { method: 'DELETE' }).then(() => client.invalidateQueries({ queryKey: ['user-blocks'] })).catch(error => setError(error.message))}>Unblock</button></div>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
