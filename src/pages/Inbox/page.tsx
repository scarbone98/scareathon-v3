import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaBoxOpen,
  FaCoins,
  FaEnvelope,
  FaGift,
  FaLock,
  FaPaperPlane,
  FaPlus,
  FaReply,
  FaTimes,
} from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import ErrorDisplay from "../../components/ErrorDisplay";
import LoadingSpinner from "../../components/LoadingSpinner";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import type {
  InboxConversation,
  InboxMessage,
  InboxParticipant,
  InboxReward,
} from "./types";

const SUBJECT_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 4000;

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

function formatDateTime(value: string) {
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
  const otherParticipant =
    participants.find((participant) => participant.userId !== currentUserId) ||
    participants[0];

  return otherParticipant?.username || "Conversation";
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

function MessageRewardCard({
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
    <div className="mt-3 rounded border border-amber-500/60 bg-amber-950/30 p-4 text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FaGift className="mt-1 shrink-0 text-amber-300" />
          <div>
            <div className="text-sm uppercase tracking-wide text-amber-300">
              {isPending ? "Pending reward" : "Claimed reward"}
            </div>
            <div className="text-lg">{rewardSummary(reward)}</div>
          </div>
        </div>
        {isPending ? (
          <button
            type="button"
            onClick={() => onClaim(reward)}
            disabled={isClaiming}
            className="inline-flex items-center justify-center gap-2 rounded border border-amber-400 bg-amber-600 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaBoxOpen />
            {isClaiming ? "Claiming" : "Claim"}
          </button>
        ) : (
          <div className="rounded border border-green-700 bg-green-950/50 px-3 py-2 text-sm text-green-200">
            Claimed
          </div>
        )}
      </div>
      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}

function NewMessageComposer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [recipientUsername, setRecipientUsername] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
      setRecipientUsername("");
      setSubject("");
      setBody("");
      setValidationError(null);
      onCreated(data.data.conversationId);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!recipientUsername.trim()) {
      setValidationError("Recipient username is required.");
      return;
    }

    if (!body.trim()) {
      setValidationError("Message body is required.");
      return;
    }

    if (subject.trim().length > SUBJECT_MAX_LENGTH) {
      setValidationError(`Subject must be ${SUBJECT_MAX_LENGTH} characters or fewer.`);
      return;
    }

    if (body.trim().length > BODY_MAX_LENGTH) {
      setValidationError(`Body must be ${BODY_MAX_LENGTH} characters or fewer.`);
      return;
    }

    createConversation.mutate();
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      onSubmit={handleSubmit}
      className="rounded border border-red-900 bg-black/70 p-4 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl text-red-300">
          <FaEnvelope />
          New Message
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-gray-300 transition hover:bg-red-950 hover:text-white"
          aria-label="Close new message composer"
        >
          <FaTimes />
        </button>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm text-gray-300">
          Username
          <input
            value={recipientUsername}
            onChange={(event) => setRecipientUsername(event.target.value)}
            className="rounded border border-red-950 bg-gray-950 px-3 py-2 text-base text-white outline-none transition focus:border-red-500"
            placeholder="recipient_username"
            autoComplete="off"
          />
        </label>

        <label className="grid gap-2 text-sm text-gray-300">
          Subject
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={SUBJECT_MAX_LENGTH}
            className="rounded border border-red-950 bg-gray-950 px-3 py-2 text-base text-white outline-none transition focus:border-red-500"
            placeholder="Optional"
          />
        </label>

        <label className="grid gap-2 text-sm text-gray-300">
          Message
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={BODY_MAX_LENGTH}
            className="min-h-36 resize-y rounded border border-red-950 bg-gray-950 px-3 py-2 text-base text-white outline-none transition focus:border-red-500"
            placeholder="Write your message"
          />
        </label>
      </div>

      {(validationError || createConversation.error) && (
        <div className="mt-4 text-sm text-red-300">
          {validationError || (createConversation.error as Error).message}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={createConversation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded bg-red-700 px-4 py-2 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaPaperPlane />
          {createConversation.isPending ? "Sending" : "Send"}
        </button>
      </div>
    </motion.form>
  );
}

function ReplyComposer({ conversationId }: { conversationId: number }) {
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () =>
      inboxPost<{ data: InboxMessage }>(
        `/inbox/conversations/${conversationId}/messages`,
        { body: body.trim() }
      ),
    onSuccess: async () => {
      setBody("");
      setValidationError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] }),
        queryClient.invalidateQueries({
          queryKey: ["inbox", "messages", conversationId],
        }),
      ]);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!body.trim()) {
      setValidationError("Reply body is required.");
      return;
    }

    if (body.trim().length > BODY_MAX_LENGTH) {
      setValidationError(`Reply must be ${BODY_MAX_LENGTH} characters or fewer.`);
      return;
    }

    replyMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 border-t border-red-950 pt-5">
      <label className="grid gap-2 text-sm text-gray-300">
        Reply
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={BODY_MAX_LENGTH}
          className="min-h-28 resize-y rounded border border-red-950 bg-gray-950 px-3 py-2 text-base text-white outline-none transition focus:border-red-500"
          placeholder="Write a reply"
        />
      </label>

      {(validationError || replyMutation.error) && (
        <div className="mt-3 text-sm text-red-300">
          {validationError || (replyMutation.error as Error).message}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={replyMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded bg-red-700 px-4 py-2 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaReply />
          {replyMutation.isPending ? "Replying" : "Reply"}
        </button>
      </div>
    </form>
  );
}

function ConversationThread({
  conversation,
  currentUserId,
}: {
  conversation: InboxConversation;
  currentUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const [claimErrorByRewardId, setClaimErrorByRewardId] = useState<
    Record<number, string>
  >({});

  const messagesQuery = useQuery<{ data: InboxMessage[] }>({
    queryKey: ["inbox", "messages", conversation.id],
    queryFn: () =>
      inboxGet<{ data: InboxMessage[] }>(
        `/inbox/conversations/${conversation.id}/messages`
      ),
  });

  const claimMutation = useMutation({
    mutationFn: ({ rewardId }: { rewardId: number }) =>
      inboxPost<{
        data: { reward: InboxReward; coinBalance: number | null };
      }>(`/inbox/rewards/${rewardId}/claim`),
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

  if (messagesQuery.isLoading) {
    return (
      <div className="relative min-h-56">
        <LoadingSpinner />
      </div>
    );
  }

  if (messagesQuery.error) {
    return (
      <div className="rounded border border-red-900 bg-red-950/40 p-4 text-red-100">
        {(messagesQuery.error as Error).message}
      </div>
    );
  }

  const messages = messagesQuery.data?.data || [];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden border-t border-red-950 bg-black/30"
    >
      <div className="space-y-4 p-4">
        {messages.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-950 p-4 text-gray-300">
            No messages found.
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderUserId === currentUserId;
            const senderName =
              message.senderType === "admin"
                ? "Scareathon"
                : message.senderUsername || (isMine ? "You" : "Unknown");

            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-full rounded border p-4 sm:max-w-[82%] ${
                    isMine
                      ? "border-red-800 bg-red-950/50"
                      : "border-gray-800 bg-gray-950"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                    <span className="font-bold text-gray-200">{senderName}</span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-gray-100">
                    {message.body}
                  </p>
                  {message.reward && (
                    <MessageRewardCard
                      reward={message.reward}
                      onClaim={(reward) =>
                        claimMutation.mutate({ rewardId: reward.id })
                      }
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
          })
        )}

        {conversation.repliesEnabled ? (
          <ReplyComposer conversationId={conversation.id} />
        ) : (
          <div className="mt-5 flex items-center gap-3 rounded border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300">
            <FaLock className="shrink-0 text-gray-500" />
            Replies are disabled for this conversation.
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ConversationCard({
  conversation,
  currentUserId,
  isSelected,
  onSelect,
}: {
  conversation: InboxConversation;
  currentUserId: string | null;
  isSelected: boolean;
  onSelect: (conversation: InboxConversation) => void;
}) {
  const title = conversationTitle(conversation, currentUserId);
  const preview =
    conversation.latestMessage?.body || "Open this conversation to read more.";
  const participant = participantName(conversation.participants, currentUserId);

  return (
    <motion.article
      layout
      className="overflow-hidden rounded border border-red-950 bg-black/70 shadow-xl"
    >
      <button
        type="button"
        onClick={() => onSelect(conversation)}
        className="grid w-full gap-3 p-4 text-left transition hover:bg-red-950/30"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-2xl text-red-200">{title}</h2>
            <div className="mt-1 text-sm text-gray-400">{participant}</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {conversation.unreadCount > 0 && (
              <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
                {conversation.unreadCount} unread
              </span>
            )}
            {!conversation.repliesEnabled && (
              <span className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">
                <FaLock />
                No reply
              </span>
            )}
            {conversation.pendingReward && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500 bg-amber-950/60 px-2 py-1 text-xs text-amber-200">
                <FaGift />
                Reward
              </span>
            )}
          </div>
        </div>

        <p className="line-clamp-2 break-words text-gray-300">{preview}</p>
        {conversation.latestMessage && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{formatDateTime(conversation.latestMessage.createdAt)}</span>
            {conversation.pendingReward?.coinAmount && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <FaCoins />
                {conversation.pendingReward.coinAmount.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isSelected && (
          <ConversationThread
            conversation={conversation}
            currentUserId={currentUserId}
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function InboxContent({ embedded = false }: { embedded?: boolean }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<
    number | null
  >(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setCurrentUserId(data.session?.user.id || null));
  }, []);

  const conversationsQuery = useQuery<{ data: InboxConversation[] }>({
    queryKey: ["inbox", "conversations"],
    queryFn: () =>
      inboxGet<{ data: InboxConversation[] }>(
        "/inbox/conversations?limit=25"
      ),
    staleTime: 1000 * 30,
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.data || [],
    [conversationsQuery.data]
  );

  const markReadMutation = useMutation({
    mutationFn: (conversationId: number) =>
      inboxPost<{ data: { conversationId: number; readAt: string } }>(
        `/inbox/conversations/${conversationId}/read`
      ),
    onSuccess: async (_data, conversationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] }),
        queryClient.invalidateQueries({
          queryKey: ["inbox", "messages", conversationId],
        }),
      ]);
    },
  });

  const handleSelectConversation = (conversation: InboxConversation) => {
    setSelectedConversationId((current) =>
      current === conversation.id ? null : conversation.id
    );

    if (conversation.unreadCount > 0) {
      markReadMutation.mutate(conversation.id);
    }
  };

  const handleCreatedConversation = (conversationId: number) => {
    setIsComposing(false);
    setSelectedConversationId(conversationId);
  };

  if (conversationsQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (conversationsQuery.error) {
    return (
      <ErrorDisplay message={(conversationsQuery.error as Error).message} />
    );
  }

  const content = (
    <div
      className={`mx-auto flex w-full flex-col gap-5 ${
        embedded ? "max-w-none" : "max-w-3xl"
      }`}
    >
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          {!embedded && (
            <div>
              <h1 className="text-4xl font-bold text-red-400">Inbox</h1>
              <p className="mt-1 text-sm text-gray-400">
                Messages, replies, and claimable rewards.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsComposing((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded bg-red-700 px-4 py-2 font-bold text-white transition hover:bg-red-600 sm:ml-auto"
          >
            {isComposing ? <FaTimes /> : <FaPlus />}
            {isComposing ? "Close" : "New Message"}
          </button>
        </motion.header>

        <AnimatePresence>
          {isComposing && (
            <NewMessageComposer
              onClose={() => setIsComposing(false)}
              onCreated={handleCreatedConversation}
            />
          )}
        </AnimatePresence>

        {conversations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded border border-red-950 bg-black/70 p-8 text-center shadow-xl"
          >
            <FaEnvelope className="mx-auto mb-4 text-4xl text-red-500" />
            <h2 className="text-2xl text-red-200">No messages yet</h2>
            <p className="mt-2 text-gray-400">
              Start a new message to open a conversation with another player.
            </p>
          </motion.div>
        ) : (
          <motion.div layout className="grid gap-4">
            {conversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                currentUserId={currentUserId}
                isSelected={selectedConversationId === conversation.id}
                onSelect={handleSelectConversation}
              />
            ))}
          </motion.div>
        )}
      </div>
  );

  if (embedded) {
    return <div className="text-gray-100">{content}</div>;
  }

  return (
    <AnimatedPage className="min-h-screen bg-black px-4 py-8 text-gray-100">
      {content}
    </AnimatedPage>
  );
}
