import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '../../fetchWithAuth';
import { useFeatures } from '../features';
import ContentControls from './ContentControls';

type Listing = { id: number; sellerUserId: string; sellerUsername: string; item: { name: string }; priceAmount: number };
// Listings belong to the counter's existing shop, including their report slips.
export default function MarketListings({ signedIn }: { signedIn: boolean }) {
  const features = useFeatures();
  const query = useQuery({ queryKey: ['marketplace-listings'], enabled: signedIn && features.reports, queryFn: async () => {
    const response = await fetchWithAuth('/marketplace/listings');
    if (!response.ok) throw new Error('Could not load rider listings.');
    return (await response.json()).data as Listing[];
  } });
  if (!features.reports || !signedIn) return null;
  return <section className="mt-5 space-y-3"><h3>Rider listings</h3>
    {query.error && <p role="alert">{query.error.message}</p>}
    {query.data?.length === 0 && <p>No rider listings right now.</p>}
    {query.data?.map(listing => <article key={listing.id} className="border-t border-current/20 pt-2"><p>{listing.item.name} · {listing.priceAmount} tickets · {listing.sellerUsername}</p><ContentControls targetType="listing" targetId={String(listing.id)} userId={listing.sellerUserId} /></article>)}
  </section>;
}
