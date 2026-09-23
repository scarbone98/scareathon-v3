export interface InboxParticipant {
  userId: string;
  username: string;
  role: "admin" | "member" | string;
}

export interface InboxReward {
  id: number;
  conversationId: number;
  messageId: number;
  recipientUserId: string;
  coinAmount: number | null;
  itemId: number | null;
  itemQuantity: number | null;
  status: "pending" | "claimed" | "cancelled" | string;
  grantedItemInstanceIds: number[];
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InboxLatestMessage {
  id: number;
  senderUserId: string | null;
  senderUsername: string | null;
  senderType: "admin" | "system" | "user" | string;
  body: string;
  createdAt: string;
}

export interface InboxConversation {
  id: number;
  conversationType: "admin_dm" | "user_dm" | string;
  createdByUserId: string | null;
  subject: string | null;
  repliesEnabled: boolean;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  participants: InboxParticipant[];
  latestMessage: InboxLatestMessage | null;
  pendingReward: InboxReward | null;
}

export interface InboxMessage {
  id: number;
  conversationId: number;
  senderUserId: string | null;
  senderUsername: string | null;
  senderType: "admin" | "system" | "user" | string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  reward: InboxReward | null;
}
