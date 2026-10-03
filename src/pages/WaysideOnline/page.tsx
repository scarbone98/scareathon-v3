import { useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAvatarCompositePublicUrl } from "../../components/avatar/avatarComposite";
import { ago, loadBoard, loadThread, react, sendPost, takeDown, useSession, type Board, type Post } from "./api";
import Lounge from "./Lounge";
import "./waysideOnline.css";

// Wayside Online: the arcade's message board, dialled up from a cabinet. Two boards
// (General, and the Scareathon's for talking about the films); post, reply, and react.
// Anyone can read; posting needs a login.

const BOARDS: { id: Board; label: string; blurb: string }[] = [
  { id: "general", label: "General", blurb: "Anything at all. Be kind; the station is listening." },
  { id: "scareathon", label: "Scareathon", blurb: "Tonight's film, last night's, the whole month. Spoilers? Say so first." },
];

const MAX_BODY = 1000;
const REFRESH_MS = 15000;

// Sign in happens on the site itself, outside the arcade cabinet's frame
function goSignIn() {
  try {
    (window.top ?? window).location.href = "/authentication";
  } catch {
    window.location.href = "/authentication";
  }
}

function Face({ userId }: { userId: string | null }) {
  if (!userId) return <span className="wo-face shrink-0" aria-hidden />;
  return (
    <img
      className="wo-face shrink-0 object-contain object-bottom"
      src={getAvatarCompositePublicUrl(userId)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={(event) => (event.currentTarget.style.visibility = "hidden")}
    />
  );
}

function Composer({ placeholder, label, onSend, small = false }: { placeholder: string; label: string; onSend: (body: string) => Promise<unknown>; small?: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setBody("");
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <textarea
        className="wo-field"
        rows={small ? 2 : 3}
        maxLength={MAX_BODY}
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit(event);
        }}
        aria-label={placeholder}
      />
      <div className="flex items-center gap-3">
        <button type="submit" className="wo-button" disabled={!body.trim() || busy}>
          {busy ? "Sending…" : label}
        </button>
        {body.length > MAX_BODY - 100 && <span className="text-[17px] text-[#7c7972]">{MAX_BODY - body.length} left</span>}
        {error && <span className="text-[18px] text-[#a3241a]">{error}</span>}
      </div>
    </form>
  );
}

function Reactions({ post, choices, signedIn, onChange }: { post: Post; choices: string[]; signedIn: boolean; onChange: () => void }) {
  const [picking, setPicking] = useState(false);
  const { mutate, isPending } = useMutation({ mutationFn: (emoji: string) => react(post.id, emoji), onSuccess: onChange });
  const unused = choices.filter((emoji) => !post.reactions.some((reaction) => reaction.emoji === emoji));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {post.reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className="wo-chip"
          aria-pressed={reaction.mine}
          aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", yours" : ""}`}
          disabled={!signedIn || isPending}
          onClick={() => mutate(reaction.emoji)}
        >
          {reaction.emoji} {reaction.count}
        </button>
      ))}
      {signedIn &&
        unused.length > 0 &&
        (picking ? (
          unused.map((emoji) => (
            <button key={emoji} type="button" className="wo-chip" disabled={isPending} aria-label={`React ${emoji}`} onClick={() => { setPicking(false); mutate(emoji); }}>
              {emoji}
            </button>
          ))
        ) : (
          <button type="button" className="wo-chip text-[#7c7972]" aria-label="Add a reaction" onClick={() => setPicking(true)}>
            + react
          </button>
        ))}
    </div>
  );
}

function TakeDown({ post, onDone }: { post: Post; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const { mutate, isPending } = useMutation({ mutationFn: () => takeDown(post.id), onSuccess: onDone });
  if (!post.canRemove) return null;
  if (!sure)
    return (
      <button type="button" className="text-[17px] text-[#7c7972] underline underline-offset-2 hover:text-[#a3241a]" onClick={() => setSure(true)}>
        take down
      </button>
    );
  return (
    <span className="text-[17px]">
      Take it down?{" "}
      <button type="button" className="text-[#a3241a] underline underline-offset-2" disabled={isPending} onClick={() => mutate()}>
        yes
      </button>{" "}
      <button type="button" className="underline underline-offset-2" onClick={() => setSure(false)}>
        no
      </button>
    </span>
  );
}

function PostView({ post, choices, signedIn, onChange, full = false, onOpen }: { post: Post; choices: string[]; signedIn: boolean; onChange: () => void; full?: boolean; onOpen?: () => void }) {
  if (post.removed)
    return (
      <article className="wo-post flex gap-3 px-3 py-2.5 italic text-[#7c7972]">
        <Face userId={null} />
        <p className="self-center">[taken down]</p>
      </article>
    );
  return (
    <article className="wo-post flex gap-3 px-3 py-2.5">
      <Face userId={post.userId} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <strong className="text-[#1a2a6c]">{post.username}</strong>
          <span className="text-[17px] text-[#7c7972]">{ago(post.createdAt)}</span>
          <span className="ml-auto">
            <TakeDown post={post} onDone={onChange} />
          </span>
        </p>
        <p className={`whitespace-pre-wrap break-words ${full ? "" : "line-clamp-5"}`}>{post.body}</p>
        <Reactions post={post} choices={choices} signedIn={signedIn} onChange={onChange} />
        {onOpen && (
          <button type="button" className="mt-1 text-[18px] text-[#1a2a6c] underline underline-offset-2" onClick={onOpen}>
            {post.replyCount ? `${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}${post.lastReplyAt ? ` · last ${ago(post.lastReplyAt)}` : ""}` : "Reply"}
          </button>
        )}
      </div>
    </article>
  );
}

function BoardView({ board, signedIn, onOpen }: { board: Board; signedIn: boolean; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["wayside-online", "board", board],
    queryFn: ({ pageParam }) => loadBoard(board, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.threads[last.threads.length - 1]?.id : undefined),
    refetchInterval: REFRESH_MS,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["wayside-online", "board", board] });
  const threads = query.data?.pages.flatMap((page) => page.threads) ?? [];
  const choices = query.data?.pages[0]?.reactions ?? [];
  const info = BOARDS.find((each) => each.id === board);
  return (
    <div className="wo-well min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="border-b-2 border-[#c3c0b8] px-3 py-2.5">
        <p className="text-[18px] text-[#55524b]">{info?.blurb}</p>
        <div className="mt-2">
          {signedIn ? (
            <Composer placeholder={`Post to ${info?.label}…`} label="Post" onSend={(body) => sendPost({ board, body }).then(refresh)} />
          ) : (
            <button type="button" className="wo-button" onClick={goSignIn}>
              Sign in to post
            </button>
          )}
        </div>
      </div>
      {query.isLoading && <p className="px-3 py-4">Dialling in…</p>}
      {query.error && <p className="px-3 py-4 text-[#a3241a]">No carrier: {(query.error as Error).message}</p>}
      {!query.isLoading && !query.error && threads.length === 0 && <p className="px-3 py-4 text-[#55524b]">Nothing posted here yet. Be the first.</p>}
      {threads.map((post) => (
        <PostView key={post.id} post={post} choices={choices} signedIn={signedIn} onChange={refresh} onOpen={() => onOpen(post.id)} />
      ))}
      {query.hasNextPage && (
        <div className="px-3 py-3">
          <button type="button" className="wo-button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? "Loading…" : "Older posts"}
          </button>
        </div>
      )}
    </div>
  );
}

function ThreadView({ id, signedIn, onBack }: { id: string; signedIn: boolean; onBack: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["wayside-online", "thread", id], queryFn: () => loadThread(id), refetchInterval: REFRESH_MS });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["wayside-online", "thread", id] });
    void queryClient.invalidateQueries({ queryKey: ["wayside-online", "board"] });
  };
  const thread = query.data;
  return (
    <div className="wo-well min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="border-b-2 border-[#c3c0b8] px-3 py-2">
        <button type="button" className="wo-button" onClick={onBack}>
          ◄ Back to the board
        </button>
      </div>
      {query.isLoading && <p className="px-3 py-4">Dialling in…</p>}
      {query.error && <p className="px-3 py-4 text-[#a3241a]">{(query.error as Error).message}</p>}
      {thread && (
        <>
          <PostView post={thread.post} choices={thread.reactions} signedIn={signedIn} full onChange={() => (thread.post.mine ? onBack() : refresh())} />
          <div className="ml-6 border-l-4 border-[#c3c0b8]">
            {thread.replies.map((post) => (
              <PostView key={post.id} post={post} choices={thread.reactions} signedIn={signedIn} full onChange={refresh} />
            ))}
          </div>
          <div className="border-t-2 border-[#c3c0b8] px-3 py-2.5">
            {signedIn ? (
              <Composer small placeholder="Write a reply…" label="Reply" onSend={(body) => sendPost({ parentId: id, body }).then(refresh)} />
            ) : (
              <button type="button" className="wo-button" onClick={goSignIn}>
                Sign in to reply
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function WaysideOnlinePage() {
  const session = useSession();
  const signedIn = Boolean(session);
  const [board, setBoard] = useState<Board | "lounge">("general");
  const [open, setOpen] = useState<string | null>(null);
  const busy = useQueryClient().isFetching({ queryKey: ["wayside-online"] }) > 0;
  return (
    <div className="wo-root flex h-dvh flex-col p-2 sm:p-4">
      <div className={`wo-window mx-auto flex min-h-0 w-full flex-1 flex-col ${board === "lounge" ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="wo-titlebar flex items-center gap-2 px-2 py-1.5">
          <span aria-hidden>▤</span>
          <span className="flex-1 truncate">WAYSIDE ONLINE</span>
          <span className="wo-modem" data-busy={busy} title={busy ? "Receiving…" : "Connected"} aria-hidden />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2 px-3 pt-3">
          <h1 className="wo-logo text-[17px] leading-none sm:text-[22px]">WAYSIDE ONLINE</h1>
          <p className="text-[18px] text-[#3c3a35]">{session === undefined ? "Connecting…" : signedIn ? "Connected" : "Guest: reading only"}</p>
        </div>
        <div role="tablist" aria-label="Boards" className="mt-3 flex gap-1 px-3">
          {BOARDS.map((each) => (
            <button
              key={each.id}
              type="button"
              role="tab"
              aria-selected={board === each.id}
              className="wo-tab"
              onClick={() => {
                setBoard(each.id);
                setOpen(null);
              }}
            >
              {each.label}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={board === "lounge"} className="wo-tab" onClick={() => setBoard("lounge")}>
            Lounge
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          {board === "lounge" ? (
            <Lounge signedIn={signedIn} goSignIn={goSignIn} />
          ) : open ? (
            <ThreadView key={open} id={open} signedIn={signedIn} onBack={() => setOpen(null)} />
          ) : (
            <BoardView key={board} board={board} signedIn={signedIn} onOpen={setOpen} />
          )}
        </div>
      </div>
    </div>
  );
}
