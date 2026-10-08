// The live notice and its query stay together; hot reload refreshes the whole notice.
/* eslint-disable react-refresh/only-export-components */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AvatarView } from "../../components/avatar/AvatarView";
import { loadFuryHosts, loadLooks, type HostingMember } from "../../pages/WaysideOnline/api";
import type { GoTo } from "../stops";
import { pixel, serif } from "../style/theme";

export function useFuryPresence(signedIn: boolean) {
  return useQuery({
    queryKey: ["wayside-online", "fury", "hosting"],
    queryFn: loadFuryHosts,
    enabled: signedIn,
    refetchInterval: 3000,
    staleTime: 2000,
  });
}

// A live notice on the station's bulletin board, using the same member presence as the lounge.
export default function FuryPresence({ hosts, signedIn, goTo, full = false }: {
  hosts: HostingMember[];
  signedIn: boolean;
  goTo: GoTo;
  full?: boolean;
}) {
  const navigate = useNavigate();
  const ids = hosts.map((host) => host.userId).sort().join(",");
  const { data: looks = {} } = useQuery({
    queryKey: ["wayside-online", "lounge", "looks", ids],
    queryFn: () => loadLooks(ids.split(",").filter(Boolean)),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const shown = full ? hosts : hosts.slice(0, 3);
  return (
    <div className="flex h-full flex-col px-4 pb-3 pt-6 text-[#2a1d14]" data-fury-presence>
      <p className="text-center text-[10px] uppercase tracking-[0.2em]">Wayside Online · Here now</p>
      <h2 className="mt-1 text-center text-[25px] leading-tight" style={pixel}>WAYSIDE FURY</h2>
      <p className="mt-1 text-center text-[16px] leading-tight" style={serif}>Join a friend's adventure</p>
      <ul className="mt-3 space-y-2">
        {shown.map(({ userId, name, hosting }) => (
          <li key={userId} className="flex items-center gap-2 border-t border-[#2a1d14]/20 pt-2">
            <span className="w-9 shrink-0 overflow-hidden">
              <AvatarView look={looks[userId] ?? null} height={48} label={name} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[17px] leading-tight" style={serif}>{name}</strong>
              <span className="block text-[12px]">Hosting · {hosting.count}/{hosting.max} players</span>
            </span>
            <button
              type="button"
              className="shrink-0 rounded-[2px] bg-[#1d2a3a] px-3 py-2 text-[14px] text-[#f2ead2] disabled:opacity-60"
              disabled={hosting.count >= hosting.max}
              aria-label={hosting.count >= hosting.max ? `${name}'s room is full` : `Join ${name}'s Wayside Fury room`}
              onClick={(event) => {
                event.stopPropagation();
                if (signedIn) navigate(`/wayside-fury?coop=${encodeURIComponent(hosting.code)}`);
                else goTo("tickets");
              }}
            >
              {hosting.count >= hosting.max ? "Full" : signedIn ? "Join" : "Sign in"}
            </button>
          </li>
        ))}
      </ul>
      {!full && hosts.length > shown.length && <p className="mt-2 text-center text-[12px]">{hosts.length - shown.length} more adventures · look closer</p>}
    </div>
  );
}
