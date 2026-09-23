import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaBoxOpen,
  FaCheck,
  FaEnvelopeOpenText,
  FaGhost,
  FaGift,
  FaLock,
  FaPaperPlane,
  FaPen,
} from "react-icons/fa";
import ErrorDisplay from "../../components/ErrorDisplay";
import { useNavigatorContext } from "../../components/navigator/context";
import LoadingSpinner from "../../components/LoadingSpinner";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import "../../styles/inbox.css";
import type {
  InboxConversation,
  InboxMessage,
  InboxParticipant,
  InboxReward,
} from "./types";

const SUBJECT_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 4000;
const CONVERSATIONS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 30;

const CONVERSATIONS_KEY = ["inbox", "conversations", "list"] as const;
const messagesKey = (conversationId: number) =>
  ["inbox", "messages", conversationId] as const;

type Page<T> = { data: T[]; hasMore?: boolean };

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Inbox request failed"
    );
  }
  return data as T;
}

function inboxGet<T>(path: string) {
  return fetchWithAuth(path).then((response) => readJson<T>(response));
}

function inboxPost<T>(path: string, body?: Record<string, unknown>) {
  return fetchWithAuth(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((response) => readJson<T>(response));
}

// Bring a freshly opened view to the top of the screen (below the fixed nav), so on
// phones the reply box isn't pushed off-screen by the character card above the inbox.
function useScrollIntoViewOnOpen<T extends HTMLElement>(ready = true) {
  const ref = useRef<T>(null);
  const hasScrolled = useRef(false);
  const { height: navHeight } = useNavigatorContext();
  useEffect(() => {
    // Measure once the content is in: a loading spinner makes the page too short to scroll
    if (!ready || hasScrolled.current) return;
    hasScrolled.current = true;
    // Wait a frame: switching from a long list shrinks the page, which would cut a scroll short
    const frame = requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY - navHeight - 12;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.max(0, Math.min(top, maxScroll)) });
    });
    return () => cancelAnimationFrame(frame);
    // Only on open; nav height changes shouldn't yank the page around
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return ref;
}

// "3m", "5h", "Mon", "May 6" for the list; full date and time inside a thread
function formatListTime(value: string) {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 6) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function participantName(
  participants: InboxParticipant[],
  currentUserId: string | null
) {
  const otherParticipant = participants.find(
    (participant) => participant.userId !== currentUserId
  );

  return otherParticipant?.username || "Scareathon";
}

function conversationTitle(
  conversation: InboxConversation,
  currentUserId: string | null
) {
  return (
    conversation.subject ||
    participantName(conversation.participants, currentUserId)
  );
}

function isFromScareathon(senderType: string) {
  return senderType === "admin" || senderType === "system";
}

function rewardSummary(reward: InboxReward) {
  const parts = [];

  if (reward.coinAmount) {
    parts.push(`${reward.coinAmount.toLocaleString()} coins`);
  }

  if (reward.itemId) {
    parts.push(
      reward.itemQuantity && reward.itemQuantity > 1
        ? `${reward.itemQuantity} items`
        : "1 item"
    );
  }

  return parts.join(" and ") || "Reward";
}

function useCurrentUserId() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setCurrentUserId(data.session?.user.id || null));
  }, []);
  return currentUserId;
}

function Avatar({ name, fromScareathon }: { name: string; fromScareathon: boolean }) {
  return (
    <span className={`inbox-avatar ${fromScareathon ? "is-scareathon" : ""}`} aria-hidden="true">
      {fromScareathon ? <FaGhost /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RewardCard({
  reward,
  onClaim,
  isClaiming,
  error,
}: {
  reward: InboxReward;
  onClaim: (reward: InboxReward) => void;
  isClaiming: boolean;
  error: string | null;
}) {
  const isPending = reward.status === "pending";

  return (
    <div className="inbox-reward">
      <FaGift className="inbox-reward-icon" aria-hidden="true" />
      <div className="inbox-reward-text">
        <span>{isPending ? "Reward waiting" : "Reward"}</span>
        <strong>{rewardSummary(reward)}</strong>
      </div>
      {isPending ? (
        <button
          type="button"
          onClick={() => onClaim(reward)}
          disabled={isClaiming}
          className="inbox-primary-button"
        >
          <FaBoxOpen aria-hidden="true" />
          {isClaiming ? "Claiming" : "Claim"}
        </button>
      ) : (
        <span className="inbox-reward-done">
          <FaCheck aria-hidden="true" /> Added to your wallet
        </span>
      )}
      {error && <p className="inbox-error inbox-reward-error">{error}</p>}
    </div>
  );
}

function NewMessageComposer({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [recipientUsername, setRecipientUsername] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const rootRef = useScrollIntoViewOnOpen<HTMLFormElement>();

  const createConversation = useMutation({
    mutationFn: () =>
      inboxPost<{ data: { conversationId: number; messageId: number } }>(
        "/inbox/conversations",
        {
          recipientUsername: recipientUsername.trim(),
          subject: subject.trim() || null,
          body: body.trim(),
        }
      ),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      onCreated(data.data.conversationId);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!recipientUsername.trim()) {
      setValidationError("Who's it for? Add a username.");
      return;
    }
    if (!body.trim()) {
      setValidationError("Write a message first.");
      return;
    }
    if (subject.trim().length > SUBJECT_MAX_LENGTH) {
      setValidationError(`Subject must be ${SUBJECT_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (body.trim().length > BODY_MAX_LENGTH) {
      setValidationError(`Message must be ${BODY_MAX_LENGTH} characters or fewer.`);
      return;
    }

    createConversation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="inbox-compose" ref={rootRef}>
      <div className="inbox-view-header">
        <button type="button" onClick={onCancel} className="inbox-back-button" aria-label="Back to inbox">
          <FaArrowLeft />
        </button>
        <h3>New message</h3>
      </div>

      <label className="inbox-field">
        To
        <input
          value={recipientUsername}
          onChange={(event) => setRecipientUsername(event.target.value)}
          placeholder="Their username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
      </label>
      <label className="inbox-field">
        Subject <span>optional</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={SUBJECT_MAX_LENGTH}
          placeholder="What's it about?"
        />
      </label>
      <label className="inbox-field">
        Message
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={BODY_MAX_LENGTH}
          rows={6}
          placeholder="Say something spooky"
        />
      </label>

      {(validationError || createConversation.error) && (
        <p className="inbox-error" role="alert">
          {validationError || (createConversation.error as Error).message}
        </p>
      )}

      <div className="inbox-compose-actions">
        <button type="button" onClick={onCancel} className="inbox-secondary-button">
          Cancel
        </button>
        <button type="submit" disabled={createConversation.isPending} className="inbox-primary-button">
          <FaPaperPlane aria-hidden="true" />
          {createConversation.isPending ? "Sending" : "Send"}
        </button>
      </div>
    </form>
  );
}

function ReplyComposer({ conversationId }: { conversationId: number }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () =>
      inboxPost<{ data: InboxMessage }>(
        `/inbox/conversations/${conversationId}/messages`,
        { body: body.trim() }
      ),
    onSuccess: async () => {
      setBody("");
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }),
      ]);
    },
    onError: (mutationError) => setError((mutationError as Error).message),
  });

  const send = () => {
    if (!body.trim() || replyMutation.isPending) return;
    if (body.trim().length > BODY_MAX_LENGTH) {
      setError(`Reply must be ${BODY_MAX_LENGTH} characters or fewer.`);
      return;
    }
    replyMutation.mutate();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  // Ctrl/Cmd+Enter sends; plain Enter keeps adding lines
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="inbox-reply">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={BODY_MAX_LENGTH}
        rows={Math.min(5, Math.max(1, body.split("\n").length))}
        placeholder="Write a reply"
        aria-label="Reply"
      />
      <button
        type="submit"
        disabled={!body.trim() || replyMutation.isPending}
        className="inbox-send-button"
        aria-label="Send reply"
      >
        <FaPaperPlane />
      </button>
      {error && <p className="inbox-error inbox-reply-error" role="alert">{error}</p>}
    </form>
  );
}

function ConversationThread({
  conversationId,
  conversation,
  currentUserId,
  onBack,
}: {
  conversationId: number;
  conversation: InboxConversation | null;
  currentUserId: string | null;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollFrom = useRef<number | null>(null);
  const newestShownId = useRef<number | null>(null);
  const [claimErrorByRewardId, setClaimErrorByRewardId] = useState<Record<number, string>>({});

  // Pages go newest-first: the first page is the latest messages, older pages load on demand
  const messagesQuery = useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    queryFn: ({ pageParam }) =>
      inboxGet<Page<InboxMessage>>(
        `/inbox/conversations/${conversationId}/messages?limit=${MESSAGES_PAGE_SIZE}` +
          (pageParam ? `&beforeMessageId=${pageParam}` : "")
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.data.length > 0 ? lastPage.data[0].id : undefined,
    refetchInterval: 1000 * 20,
  });

  const messages = useMemo(
    () => [...(messagesQuery.data?.pages || [])].reverse().flatMap((page) => page.data),
    [messagesQuery.data]
  );
  const rootRef = useScrollIntoViewOnOpen<HTMLDivElement>(!messagesQuery.isLoading);

  const markRead = useMutation({
    mutationFn: () => inboxPost(`/inbox/conversations/${conversationId}/read`),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["inbox", "unread-count"] }),
      ]),
  });

  const unreadCount = conversation?.unreadCount || 0;
  useEffect(() => {
    if (unreadCount > 0 && !markRead.isPending) markRead.mutate();
    // Only react to the unread count; the mutation object changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, unreadCount]);

  // Keep the reader at the newest message, but hold position when older messages load above
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || messages.length === 0) return;
    if (restoreScrollFrom.current !== null) {
      container.scrollTop = container.scrollHeight - restoreScrollFrom.current;
      restoreScrollFrom.current = null;
      return;
    }
    const newestId = messages[messages.length - 1].id;
    if (newestShownId.current !== newestId) {
      newestShownId.current = newestId;
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const loadOlder = () => {
    if (scrollRef.current) {
      restoreScrollFrom.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
    }
    messagesQuery.fetchNextPage();
  };

  const claimMutation = useMutation({
    mutationFn: ({ rewardId }: { rewardId: number }) =>
      inboxPost<{ data: { reward: InboxReward; coinBalance: number | null } }>(
        `/inbox/rewards/${rewardId}/claim`
      ),
    onSuccess: async (_data, variables) => {
      setClaimErrorByRewardId((current) => {
        const next = { ...current };
        delete next[variables.rewardId];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["user", "wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["avatar"] }),
      ]);
    },
    onError: (error, variables) => {
      setClaimErrorByRewardId((current) => ({
        ...current,
        [variables.rewardId]: (error as Error).message,
      }));
    },
  });

  const title = conversation ? conversationTitle(conversation, currentUserId) : "Conversation";
  const participant = conversation
    ? participantName(conversation.participants, currentUserId)
    : null;
  // Unknown until the list loads (deep link); the server still enforces it on send
  const repliesEnabled = conversation ? conversation.repliesEnabled : true;

  return (
    <div className="inbox-thread" ref={rootRef}>
      <div className="inbox-view-header">
        <button type="button" onClick={onBack} className="inbox-back-button" aria-label="Back to inbox">
          <FaArrowLeft />
        </button>
        <div className="inbox-thread-title">
          <h3>{title}</h3>
          {participant && participant !== title && <p>{participant}</p>}
        </div>
      </div>

      <div className="inbox-messages" ref={scrollRef}>
        {messagesQuery.isLoading ? (
          <div className="inbox-center"><LoadingSpinner /></div>
        ) : messagesQuery.error ? (
          <p className="inbox-error">{(messagesQuery.error as Error).message}</p>
        ) : (
          <>
            {messagesQuery.hasNextPage && (
              <button
                type="button"
                className="inbox-load-more"
                onClick={loadOlder}
                disabled={messagesQuery.isFetchingNextPage}
              >
                {messagesQuery.isFetchingNextPage ? "Loading…" : "Load older messages"}
              </button>
            )}
            {messages.length === 0 && <p className="inbox-muted inbox-center">No messages yet.</p>}
            {messages.map((message) => {
              const isMine = message.senderUserId === currentUserId;
              const fromScareathon = isFromScareathon(message.senderType);
              const senderName = fromScareathon
                ? "Scareathon"
                : isMine
                  ? "You"
                  : message.senderUsername || "Unknown";

              return (
                <div key={message.id} className={`inbox-bubble-row ${isMine ? "is-mine" : ""}`}>
                  <div className={`inbox-bubble ${isMine ? "is-mine" : ""} ${fromScareathon ? "is-scareathon" : ""}`}>
                    <div className="inbox-bubble-meta">
                      <strong>{senderName}</strong>
                      <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                    </div>
                    <p>{message.body}</p>
                    {message.reward && (
                      <RewardCard
                        reward={message.reward}
                        onClaim={(reward) => claimMutation.mutate({ rewardId: reward.id })}
                        isClaiming={
                          claimMutation.isPending &&
                          claimMutation.variables?.rewardId === message.reward.id
                        }
                        error={claimErrorByRewardId[message.reward.id] || null}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {repliesEnabled ? (
        <ReplyComposer conversationId={conversationId} />
      ) : null}
    </div>
  );
}

function ConversationRow({
  conversation,
  currentUserId,
  onOpen,
}: {
  conversation: InboxConversation;
  currentUserId: string | null;
  onOpen: (conversationId: number) => void;
}) {
  const latest = conversation.latestMessage;
  const fromScareathon =
    conversation.conversationType === "admin_dm" ||
    (latest ? isFromScareathon(latest.senderType) : false);
  const name = participantName(conversation.participants, currentUserId);
  const isUnread = conversation.unreadCount > 0;
  const previewPrefix = latest && latest.senderUserId === currentUserId ? "You: " : "";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        className={`inbox-row ${isUnread ? "is-unread" : ""}`}
      >
        <Avatar name={name} fromScareathon={fromScareathon} />
        <span className="inbox-row-main">
          <span className="inbox-row-top">
            <span className="inbox-row-title">{conversationTitle(conversation, currentUserId)}</span>
            <time dateTime={conversation.updatedAt}>
              {formatListTime(latest?.createdAt || conversation.updatedAt)}
            </time>
          </span>
          <span className="inbox-row-bottom">
            <span className="inbox-row-preview">
              {previewPrefix}
              {latest?.body || "Open to read"}
            </span>
            {conversation.pendingReward && (
              <span className="inbox-chip is-reward"><FaGift aria-hidden="true" /> Reward</span>
            )}
            {!conversation.repliesEnabled && (
              <FaLock className="inbox-row-lock" aria-label="Replies off" />
            )}
            {isUnread && <span className="inbox-unread-dot">{conversation.unreadCount}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

export function InboxContent() {
  const currentUserId = useCurrentUserId();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get("c")) || null;
  const isComposing = searchParams.get("compose") === "1";

  const conversationsQuery = useInfiniteQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: ({ pageParam }) =>
      inboxGet<Page<InboxConversation>>(
        `/inbox/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=${pageParam}`
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length * CONVERSATIONS_PAGE_SIZE : undefined,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.data) || [],
    [conversationsQuery.data]
  );

  // Views live in the URL so the phone's back button returns to the list
  const openConversation = (conversationId: number) => setSearchParams({ c: String(conversationId) });
  const openComposer = () => setSearchParams({ compose: "1" });
  const backToList = () => setSearchParams({});

  if (isComposing) {
    return (
      <div className="inbox">
        <NewMessageComposer onCancel={backToList} onCreated={openConversation} />
      </div>
    );
  }

  if (selectedId) {
    return (
      <div className="inbox">
        <ConversationThread
          key={selectedId}
          conversationId={selectedId}
          conversation={conversations.find((conversation) => conversation.id === selectedId) || null}
          currentUserId={currentUserId}
          onBack={backToList}
        />
      </div>
    );
  }

  if (conversationsQuery.isLoading) {
    return <div className="inbox inbox-center"><LoadingSpinner /></div>;
  }

  if (conversationsQuery.error) {
    return <ErrorDisplay message={(conversationsQuery.error as Error).message} />;
  }

  return (
    <div className="inbox">
      <div className="inbox-toolbar">
        <span className="inbox-muted">
          {conversations.length === 0
            ? "Nothing here yet"
            : `${conversations.length}${conversationsQuery.hasNextPage ? "+" : ""} conversation${conversations.length === 1 && !conversationsQuery.hasNextPage ? "" : "s"}`}
        </span>
        <button type="button" onClick={openComposer} className="inbox-primary-button">
          <FaPen aria-hidden="true" /> New message
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="inbox-empty">
          <FaEnvelopeOpenText aria-hidden="true" />
          <p>No messages yet</p>
          <span>Rewards and notes from Scareathon show up here, and you can message other players by username.</span>
        </div>
      ) : (
        <ul className="inbox-list">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              currentUserId={currentUserId}
              onOpen={openConversation}
            />
          ))}
        </ul>
      )}

      {conversationsQuery.hasNextPage && (
        <button
          type="button"
          className="inbox-load-more"
          onClick={() => conversationsQuery.fetchNextPage()}
          disabled={conversationsQuery.isFetchingNextPage}
        >
          {conversationsQuery.isFetchingNextPage ? "Loading…" : "Load more conversations"}
        </button>
      )}
    </div>
  );
}
