import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useSession } from "../MonsterBash/account";
import { Balance, MonsterSprite } from "./parts";
import { PANEL, useWallet, type RoomProps } from "./wallet";
import "./casino.css";

const MonsterBash = lazy(() => import("../MonsterBash/page"));
const Racing = lazy(() => import("./rooms/Racing"));
const Slots = lazy(() => import("./rooms/Slots"));
const Roulette = lazy(() => import("./rooms/Roulette"));
const PicturePoker = lazy(() => import("./rooms/PicturePoker"));

// The rooms off the casino floor. Monster Bash is its own live show with its
// own bet slip; the rest are house games sharing the floor's wallet.
const ROOMS = [
  { id: "monster-bash", name: "Monster Bash", blurb: "Monsters brawl around the clock. Bet with the crowd and watch the odds swing.", monster: "werewolf" },
  { id: "racing", name: "Monster Racing", blurb: "A live race every minute. Pick your monster before the off, then watch with everyone else.", monster: "rat" },
  { id: "slots", name: "Slots", blurb: "Three reels of monsters. Line them up for up to 100 times your bet.", monster: "pumpkin" },
  { id: "roulette", name: "Roulette", blurb: "Red or black, odd or even, or one lucky number at 35 to 1.", monster: "skull" },
  { id: "picture-poker", name: "Picture Poker", blurb: "Five picture cards and one swap. Beat the Scarecrow's hand.", monster: "scarecrow" },
] as const;

type RoomId = (typeof ROOMS)[number]["id"];

function HouseRoom({ room, props }: { room: Exclude<RoomId, "monster-bash">; props: RoomProps }) {
  if (room === "racing") return <Racing {...props} />;
  if (room === "slots") return <Slots {...props} />;
  if (room === "roulette") return <Roulette {...props} />;
  return <PicturePoker {...props} />;
}

function Lobby({ onEnter }: { onEnter: (room: RoomId) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ROOMS.map((room) => (
        <button
          key={room.id}
          type="button"
          onClick={() => onEnter(room.id)}
          className={`${PANEL} group flex items-center gap-4 p-4 text-left transition hover:border-purple-400 hover:bg-purple-950/40`}
        >
          <MonsterSprite monster={room.monster} size={64} walking className="transition group-hover:scale-110" />
          <span className="min-w-0">
            <span className="block font-zombie text-2xl tracking-wide text-red-500">{room.name}</span>
            <span className="mt-1 block text-sm text-purple-200/80">{room.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Casino() {
  const [params, setParams] = useSearchParams();
  const room = ROOMS.find((entry) => entry.id === params.get("room"))?.id ?? null;
  const session = useSession();
  const signedIn = Boolean(session);
  // Re-read on every change of room: Monster Bash moves tickets on its own.
  const { wallet, failed, refresh, setBalance } = useWallet(signedIn, room);

  const enter = (next: RoomId | null) => {
    const search = new URLSearchParams(params);
    if (next) search.set("room", next);
    else search.delete("room");
    setParams(search);
  };

  const tab = (id: RoomId | null, label: string) => (
    <button
      key={id ?? "lobby"}
      type="button"
      onClick={() => enter(id)}
      aria-current={room === id ? "page" : undefined}
      className={`shrink-0 rounded-md px-3 py-2 text-sm font-bold transition ${
        room === id ? "bg-purple-800 text-white" : "text-purple-200/70 hover:text-orange-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AnimatedPage className="bg-[#07030c]">
      <main className="relative z-10 mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 pb-8 pt-3 sm:px-6 md:gap-4 md:pt-5 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-zombie text-3xl tracking-wide text-red-500 md:text-4xl">Casino!</h1>
            {room === null && <p className="text-sm text-purple-200/70">Bet your tickets on fights, races, reels, the wheel and the cards.</p>}
          </div>
          {wallet && room !== "monster-bash" && <Balance wallet={wallet} />}
        </header>
        <nav aria-label="Casino rooms" className={`${PANEL} flex gap-1 overflow-x-auto p-1`}>
          {tab(null, "Lobby")}
          {ROOMS.map((entry) => tab(entry.id, entry.name))}
        </nav>

        <Suspense fallback={<LoadingSpinner />}>
          {room === null ? (
            <Lobby onEnter={enter} />
          ) : room === "monster-bash" ? (
            <MonsterBash />
          ) : (
            <HouseRoom room={room} props={{ signedIn, wallet, walletFailed: failed, retryWallet: refresh, setBalance }} />
          )}
        </Suspense>
      </main>
    </AnimatedPage>
  );
}
