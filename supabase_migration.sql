-- ==========================================================
-- Personal Assistant Supabase Migration Script
-- Enables UUIDs, RLS, Realtime publications, and all tables
-- ==========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    llm_model TEXT DEFAULT 'gemini-2.5-flash',
    gemini_api_key TEXT,
    display_name TEXT DEFAULT '',
    user_aliases TEXT[] DEFAULT ARRAY[]::TEXT[],
    primary_email TEXT,
    digest_hour INTEGER DEFAULT 8,
    digest_minute INTEGER DEFAULT 0,
    auto_purge_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Connected Email Accounts Table
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_type TEXT DEFAULT 'custom_imap', -- 'gmail', 'outlook', 'icloud', 'custom_imap'
    email TEXT NOT NULL,
    imap_server TEXT NOT NULL,
    imap_port INTEGER DEFAULT 993,
    smtp_server TEXT,
    smtp_port INTEGER DEFAULT 587,
    password TEXT NOT NULL,
    signature TEXT DEFAULT '',
    use_ssl BOOLEAN DEFAULT true,
    is_enabled BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Unified Conversation Threads (Email & WhatsApp)
CREATE TABLE IF NOT EXISTS public.conversation_threads (
    id TEXT PRIMARY KEY, -- Hash: sha256(user_id || channel || external_id)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    channel TEXT NOT NULL, -- 'email' | 'whatsapp'
    external_id TEXT NOT NULL,
    subject_or_title TEXT,
    participants TEXT,
    sender_email TEXT,
    snippet TEXT,
    body_text TEXT,
    body_html TEXT,
    last_message_at TIMESTAMPTZ NOT NULL,
    last_message_sender TEXT,
    is_outgoing_last BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'ACTION_NEEDED', 'RESOLVED', 'PURGED'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AI Triaged Action Items (Level 1, 2, 3)
CREATE TABLE IF NOT EXISTS public.action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    type TEXT NOT NULL, -- 'REPLY_NEEDED', 'PROMISED_TO_SEND', 'AWAITING_THEIR_REPLY'
    priority TEXT NOT NULL DEFAULT 'P2_MEDIUM', -- 'P1_HIGH' (Level 1), 'P2_MEDIUM' (Level 2), 'P3_LOW' (Level 3)
    title TEXT NOT NULL,
    summary TEXT,
    deadline_text TEXT,
    suggested_reply TEXT,
    suggested_replies TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_completed BOOLEAN DEFAULT false,
    detected_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 6. Exclusion Rules Table (Manual & System rules)
CREATE TABLE IF NOT EXISTS public.exclusion_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'all', -- 'all', 'email', 'whatsapp'
    rule_type TEXT NOT NULL DEFAULT 'sender', -- 'sender', 'subject', 'keyword', 'domain'
    pattern TEXT NOT NULL,
    reason TEXT,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. AI Purge Log (Ignored & Nonsense Review)
CREATE TABLE IF NOT EXISTS public.ai_purge_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    sender TEXT,
    subject_or_snippet TEXT,
    reason TEXT,
    confidence_score REAL DEFAULT 1.0,
    purged_at TIMESTAMPTZ DEFAULT now(),
    restored BOOLEAN DEFAULT false,
    restored_at TIMESTAMPTZ
);

-- 8. WhatsApp Sessions & Status Table
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'disconnected', -- 'disconnected', 'qr_ready', 'connecting', 'connected'
    qr_code TEXT,
    phone_number TEXT,
    last_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exclusion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_purge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for user_settings
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = id);

-- Policies for accounts
CREATE POLICY "Users can manage own accounts" ON public.accounts
    FOR ALL USING (auth.uid() = user_id);

-- Policies for conversation_threads
CREATE POLICY "Users can manage own conversation threads" ON public.conversation_threads
    FOR ALL USING (auth.uid() = user_id);

-- Policies for action_items
CREATE POLICY "Users can manage own action items" ON public.action_items
    FOR ALL USING (auth.uid() = user_id);

-- Policies for exclusion_rules (user can view system rules or their own)
CREATE POLICY "Users can view and manage exclusion rules" ON public.exclusion_rules
    FOR ALL USING (auth.uid() = user_id OR is_system = true);

-- Policies for ai_purge_log
CREATE POLICY "Users can view and restore own purge log" ON public.ai_purge_log
    FOR ALL USING (auth.uid() = user_id);

-- Policies for whatsapp_sessions
CREATE POLICY "Users can manage own whatsapp session" ON public.whatsapp_sessions
    FOR ALL USING (auth.uid() = user_id);

-- ==========================================================
-- REALTIME SUBSCRIPTIONS
-- Enable Realtime publication for tables with live updates
-- ==========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_purge_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;

-- ==========================================================
-- SEED DEFAULT SYSTEM EXCLUSION RULES
-- ==========================================================
INSERT INTO public.exclusion_rules (user_id, channel, rule_type, pattern, reason, is_system) VALUES
    (NULL, 'email', 'sender', 'no-reply', 'Automated noreply broadcast address', true),
    (NULL, 'email', 'sender', 'noreply', 'Automated noreply broadcast address', true),
    (NULL, 'email', 'sender', 'donotreply', 'Automated notification address', true),
    (NULL, 'email', 'sender', 'notifications@', 'Automated system notifications', true),
    (NULL, 'email', 'sender', 'notification@', 'Automated system notifications', true),
    (NULL, 'email', 'sender', 'mailer-daemon', 'Email delivery failure daemon', true),
    (NULL, 'email', 'sender', 'bounce@', 'Email bounce handler', true),
    (NULL, 'email', 'sender', 'postmaster@', 'Mail server postmaster', true),
    (NULL, 'email', 'sender', 'jira@', 'Atlassian Jira issue tracking', true),
    (NULL, 'email', 'sender', 'calendar-notification@google.com', 'Google Calendar notifications', true),
    (NULL, 'email', 'sender', 'news@', 'Newsletter / marketing broadcasts', true),
    (NULL, 'email', 'subject', 'terms of service', 'Legal terms and privacy policy updates', true),
    (NULL, 'email', 'subject', 'privacy policy', 'Privacy policy updates', true),
    (NULL, 'email', 'subject', 'automatic reply', 'Out of office automatic response', true),
    (NULL, 'email', 'subject', 'out of office', 'Out of office automatic response', true)
ON CONFLICT DO NOTHING;
