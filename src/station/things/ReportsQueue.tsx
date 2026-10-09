import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '../../fetchWithAuth';
import { useFeatures } from '../features';
import { photoUrl } from '../../pages/PictoBox/api';

type Report = { id: string; target_type: string; target_id: string; target_username: string | null; reason: string; snapshot: { text?: string } | null; created_at: string };
async function send(path: string, init?: RequestInit) {
  const response = await fetchWithAuth(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not review reports.');
  return body;
}
export default function ReportsQueue() {
  const features = useFeatures();
  const client = useQueryClient();
  const [restrict, setRestrict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reports = useQuery({ queryKey: ['content-reports'], enabled: features.reports, queryFn: async () => (await send('/admin/content-reports')).reports as Report[] });
  if (!features.reports) return null;
  const review = async (id: string, action: 'dismiss' | 'remove') => {
    setBusy(true); setError('');
    try {
      await send(`/admin/content-reports/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, restrictUser: action === 'remove' && restrict }) });
      await client.invalidateQueries({ queryKey: ['content-reports'] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <section className="border-t border-current/20 pt-3">
    <h3>Content reports</h3>
    <label className="my-2 flex items-center gap-2"><input type="checkbox" checked={restrict} onChange={event => setRestrict(event.target.checked)} />Also restrict the author when removing content</label>
    {reports.isLoading && <p>Loading…</p>}
    {reports.error && <p role="alert">{reports.error.message}</p>}
    {reports.data?.length === 0 && <p>No reports waiting.</p>}
    {reports.data?.map(report => <article key={report.id} className="my-3 space-y-2 border border-current/20 p-3">
      <p>{report.target_type} #{report.target_id} · {report.target_username || 'Rider'}</p>
      <p className="whitespace-pre-wrap break-words">{report.snapshot?.text}</p>
      {report.target_type === 'photo' && <img className="max-h-64 max-w-full" src={photoUrl(report.target_id)} alt="Reported PictoBox photo" loading="lazy" />}<p>Reason: {report.reason}</p>
      <div className="flex flex-wrap gap-4"><button type="button" className="underline" disabled={busy} onClick={() => void review(report.id, 'dismiss')}>Dismiss</button><button type="button" className="underline" disabled={busy} onClick={() => void review(report.id, 'remove')}>Remove content</button></div>
    </article>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
