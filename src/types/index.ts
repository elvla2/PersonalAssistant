export type PriorityLevel = 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW' | 'NONE';

export type ActionType = 'REPLY_NEEDED' | 'PROMISED_TO_SEND' | 'AWAITING_THEIR_REPLY' | 'NONE';

export type ChannelType = 'email' | 'whatsapp';

export type AccountType = 'gmail' | 'outlook' | 'icloud' | 'custom_imap';

export interface UserSetting {
  id: string;
  llm_model: string;
  gemini_api_key?: string | null;
  display_name: string;
  user_aliases: string[];
  primary_email?: string | null;
  digest_hour: number;
  digest_minute: number;
  auto_purge_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  email: string;
  imap_server: string;
  imap_port: number;
  smtp_server?: string | null;
  smtp_port?: number | null;
  password?: string;
  signature?: string;
  use_ssl: boolean;
  is_enabled: boolean;
  last_synced_at?: string | null;
  created_at?: string;
}

export interface ConversationThread {
  id: string;
  user_id: string;
  account_id?: string | null;
  channel: ChannelType;
  external_id: string;
  subject_or_title?: string | null;
  participants?: string | null;
  sender_email?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  last_message_at: string;
  last_message_sender?: string | null;
  is_outgoing_last: boolean;
  status: 'PENDING' | 'ACTION_NEEDED' | 'RESOLVED' | 'PURGED';
  created_at?: string;
  updated_at?: string;
  // Augmented priority and action fields
  priority?: PriorityLevel;
  action_item_id?: string;
  deadline_text?: string;
  action_type?: ActionType;
  suggested_reply?: string;
  suggested_replies?: string[];
  purge_reason?: string;
}

export interface ActionItem {
  id: string;
  user_id: string;
  thread_id: string;
  account_id?: string | null;
  account_name?: string;
  channel: ChannelType;
  type: ActionType;
  priority: PriorityLevel;
  title: string;
  summary?: string;
  deadline_text?: string;
  suggested_reply?: string;
  suggested_replies?: string[];
  is_completed: boolean;
  detected_at: string;
  resolved_at?: string | null;
  last_message_at?: string;
  // Joined or augmented attributes
  contact_name?: string;
  sender_email?: string;
  external_id?: string;
  full_subject?: string;
  body_snippet?: string;
  body_html?: string;
}

export interface ExclusionRule {
  id: string;
  user_id?: string | null;
  channel: 'all' | 'email' | 'whatsapp';
  rule_type: 'sender' | 'subject' | 'keyword' | 'domain';
  pattern: string;
  reason?: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface AiPurgeLogItem {
  id: string;
  user_id: string;
  channel: string;
  thread_id: string;
  sender?: string | null;
  subject_or_snippet?: string | null;
  reason?: string | null;
  confidence_score: number;
  purged_at: string;
  restored: boolean;
  restored_at?: string | null;
}

export interface WhatsAppSession {
  user_id: string;
  status: 'disconnected' | 'qr_ready' | 'connecting' | 'connected';
  qr_code?: string | null;
  phone_number?: string | null;
  last_seen_at?: string | null;
  updated_at?: string;
}

export interface TriageResult {
  has_action_item: boolean;
  action_type: ActionType;
  priority: PriorityLevel;
  title: string;
  summary: string;
  deadline_text?: string;
  suggested_reply?: string;
  suggested_replies?: string[];
  purge_reason?: string;
}
