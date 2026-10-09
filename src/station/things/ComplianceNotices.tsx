import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '../../fetchWithAuth';
import Sheet from '../Sheet';
import { useFeatures } from '../features';
import { stubButton } from '../style/theme';
import type { GoTo } from '../stops';
import LegalPapers from './LegalPapers';

export default function ComplianceNotices({ userId, goTo }: { userId?: string; goTo: GoTo }) {
  const features = useFeatures();
  const client = useQueryClient();
  const [region, setRegion] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const legal = typeof window !== 'undefined' && (['/privacy', '/terms'].includes(window.location.pathname) || new URLSearchParams(window.location.search).has('legal'));
  const age = useQuery({
    queryKey: ['age-confirmation', userId], enabled: features.ageGate && Boolean(userId),
    queryFn: async () => {
      const response = await fetchWithAuth('/user/age-confirmation');
      if (!response.ok) throw new Error('Could not check your ticket. Please try again.');
      return response.json() as Promise<{ required: boolean }>;
    }, staleTime: 60_000, refetchInterval: 60_000,
  });
  useEffect(() => { setDismissed(false); setChecked(false); setError(''); }, [userId]);
  useEffect(() => {
    const blocked = () => setRegion(true);
    const ageRequired = () => { setDismissed(false); void client.invalidateQueries({ queryKey: ['age-confirmation'] }); };
    window.addEventListener('ws-region-unavailable', blocked);
    window.addEventListener('ws-age-required', ageRequired);
    return () => { window.removeEventListener('ws-region-unavailable', blocked); window.removeEventListener('ws-age-required', ageRequired); };
  }, [client]);
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetchWithAuth('/user/age-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Please try again.');
      await client.invalidateQueries({ queryKey: ['age-confirmation'] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const required = features.ageGate && age.data?.required && !dismissed;
  return <>
    {legal && <LegalPapers standalone />}
    <Sheet above sheet={region ? { id: 'region-notice', title: 'Station notice', body: <div className="space-y-3 text-[#2a1d14]"><p>Wayside Station isn&apos;t available in your region yet.</p><p>You can still download your data or close your account in Settings.</p><button className={stubButton} onClick={() => { setRegion(false); goTo('mail', 'register'); }}>Open Settings</button></div> } : required ? {
      id: 'age-confirmation', title: 'Your ticket · age confirmation', body: <div className="space-y-3 text-[#2a1d14]">
        <p>Please confirm your age once before posting, chatting, sharing photos or listing items.</p>
        <label className="flex items-center gap-3"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />I&apos;m {features.ageGateMinAge} or older</label>
        <button type="button" className={stubButton} disabled={!checked || busy} onClick={() => void confirm()}>Confirm</button>
        {error && <p role="alert">{error}</p>}
      </div>,
    } : null} onClose={() => { setRegion(false); setDismissed(true); }} />
  </>;
}
