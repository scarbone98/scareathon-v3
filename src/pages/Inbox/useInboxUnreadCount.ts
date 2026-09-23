import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";

export const INBOX_UNREAD_COUNT_KEY = ["inbox", "unread-count"] as const;

// Unread messages across every conversation, for nav and profile badges.
// The conversation list is paginated, so summing it would undercount.
export function useInboxUnreadCount() {
  const { data } = useQuery<number>({
    queryKey: INBOX_UNREAD_COUNT_KEY,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return 0;

      const response = await fetchWithAuth("/inbox/unread-count");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to load unread messages");
      }
      return Number(body.data?.unreadCount || 0);
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  return data || 0;
}
