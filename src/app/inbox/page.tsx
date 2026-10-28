'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navigation from '@/components/Navigation';
import ReplyModal from '@/components/modals/ReplyModal';
import ExclusionModal from '@/components/modals/ExclusionModal';
import EmailHtmlViewer from '@/components/inbox/EmailHtmlViewer';
import { useRealtime } from '@/components/RealtimeProvider';
import { createClient } from '@/lib/supabase/client';
import { ConversationThread, Account, ActionItem, PriorityLevel } from '@/types';
import {
  Inbox,
  Mail,
  MessageCircle,
  Search,
  Reply,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Clock,
  Filter,
  User,
  Calendar,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Check,
  Users,
} from 'lucide-react';

const PRIORITY_ORDER: Record<string, number> = {
  P1_HIGH: 3,
  P2_MEDIUM: 2,
  P3_LOW: 1,
  NONE: 0,
};

export default function UnifiedInboxPage() {
  const { lastUpdated } = useRealtime();
  const supabase = createClient();

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadBodies, setThreadBodies] = useState<Record<string, { body_html?: string | null; body_text?: string | null }>>({});
  const threadBodiesRef = useRef(threadBodies);
  threadBodiesRef.current = threadBodies;
  const [loadingBody, setLoadingBody] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'email' | 'whatsapp'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTION_NEEDED' | 'RESOLVED' | 'PURGED'>('ACTION_NEEDED');

  // Modals
  const [replyItem, setReplyItem] = useState<ActionItem | null>(null);
  const [exclusionThread, setExclusionThread] = useState<ConversationThread | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      // Concurrently fetch threads, action items, accounts, and purge logs
      const [threadsRes, actionsRes, accountsRes, purgeLogRes] = await Promise.all([
        supabase
          .from('conversation_threads')
          .select('id, user_id, account_id, channel, external_id, subject_or_title, last_message_sender, last_message_at, snippet, status, sender_email, is_outgoing_last, updated_at')
          .order('last_message_at', { ascending: false }),
        supabase
          .from('action_items')
          .select('id, thread_id, priority, type, deadline_text, suggested_reply, suggested_replies, is_completed'),
        supabase
          .from('accounts')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('ai_purge_log')
          .select('thread_id, reason, confidence_score, purged_at, restored')
          .order('purged_at', { ascending: false }),
      ]);

      if (accountsRes.data) {
        setAccounts(accountsRes.data);
      }

      // Map action items by thread_id, prioritizing uncompleted or highest priority item
      const actionMap = new Map<string, any>();
      (actionsRes.data || []).forEach((act: any) => {
        if (!act.thread_id) return;
        const existing = actionMap.get(act.thread_id);
        if (!existing) {
          actionMap.set(act.thread_id, act);
        } else {
          if (!act.is_completed && existing.is_completed) {
            actionMap.set(act.thread_id, act);
          } else if (act.is_completed === existing.is_completed) {
            const existingRank = PRIORITY_ORDER[existing.priority] || 0;
            const currentRank = PRIORITY_ORDER[act.priority] || 0;
            if (currentRank > existingRank) {
              actionMap.set(act.thread_id, act);
            }
          }
        }
      });

      const purgeMap = new Map<string, string>();
      (purgeLogRes.data || []).forEach((log: any) => {
        if (log.thread_id && !purgeMap.has(log.thread_id) && log.reason) {
          purgeMap.set(log.thread_id, log.reason);
        }
      });

      // Enrich threads with action items priority, deadline & purge reason
      const enrichedThreads: ConversationThread[] = (threadsRes.data || []).map((t: any) => {
        const action = actionMap.get(t.id);
        const purgeReason = purgeMap.get(t.id);
        return {
          ...t,
          priority: action?.priority || 'NONE',
          action_item_id: action?.id,
          deadline_text: action?.deadline_text,
          action_type: action?.type,
          suggested_reply: action?.suggested_reply,
          suggested_replies: action?.suggested_replies,
          purge_reason: purgeReason || (t.status === 'PURGED' ? 'Filtered by AI auto-purge or exclusion rule' : undefined),
        };
      });

      setThreads(enrichedThreads);

      if (!selectedThreadId && enrichedThreads.length > 0) {
        const firstActionNeeded = enrichedThreads.find((t) => t.status === 'ACTION_NEEDED');
        setSelectedThreadId(firstActionNeeded ? firstActionNeeded.id : enrichedThreads[0].id);
      }
    } catch (err: any) {
      console.error('Unified inbox error:', err.message);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [lastUpdated]);

  // Lazy-load full thread bodies (body_html, body_text) on demand & update when real-time ticks
  useEffect(() => {
    if (!selectedThreadId) return;
    let isMounted = true;
    const currentCached = threadBodiesRef.current[selectedThreadId];
    if (!currentCached) {
      setLoadingBody(true);
    }

    const fetchBody = async () => {
      try {
        const { data } = await supabase
          .from('conversation_threads')
          .select('body_html, body_text')
          .eq('id', selectedThreadId)
          .maybeSingle();

        if (isMounted && data) {
          setThreadBodies((prev) => {
            const prevEntry = prev[selectedThreadId];
            if (
              prevEntry &&
              prevEntry.body_html === data.body_html &&
              prevEntry.body_text === data.body_text
            ) {
              return prev;
            }
            return {
              ...prev,
              [selectedThreadId]: {
                body_html: data.body_html,
                body_text: data.body_text,
              },
            };
          });
        }
      } catch (err) {
        console.error('Error fetching thread body:', err);
      } finally {
        if (isMounted) setLoadingBody(false);
      }
    };

    fetchBody();

    return () => {
      isMounted = false;
    };
  }, [selectedThreadId, lastUpdated]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (channelFilter !== 'ALL' && t.channel !== channelFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const sMatch = (t.subject_or_title || '').toLowerCase().includes(q);
        const sendMatch = (t.last_message_sender || '').toLowerCase().includes(q);
        const snipMatch = (t.snippet || '').toLowerCase().includes(q);
        if (!sMatch && !sendMatch && !snipMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      const tA = new Date(a.last_message_at).getTime();
      const tB = new Date(b.last_message_at).getTime();
      if (tA !== tB) return tB - tA;
      return (a.subject_or_title || '').localeCompare(b.subject_or_title || '');
    });
  }, [threads, channelFilter, statusFilter, priorityFilter, searchQuery]);

  const selectedThread = filteredThreads.find((t) => t.id === selectedThreadId) || filteredThreads[0] || null;

  const activeBodyHtml = selectedThread ? (threadBodies[selectedThread.id]?.body_html ?? selectedThread.body_html) : null;
  const activeBodyText = selectedThread ? (threadBodies[selectedThread.id]?.body_text ?? selectedThread.body_text) : null;

  const whatsappMessages = useMemo(() => {
    if (selectedThread?.channel === 'whatsapp' && activeBodyText) {
      try {
        const parsed = JSON.parse(activeBodyText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }
    return null;
  }, [selectedThread, activeBodyText]);

  useEffect(() => {
    if (selectedThread?.channel === 'whatsapp' && whatsappMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedThreadId, whatsappMessages?.length, selectedThread?.channel]);

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setMobileDetailOpen(true);
  };

  const handleOpenReplyForThread = (thread: ConversationThread) => {
    const cachedBody = threadBodies[thread.id];
    const itemBodyHtml = cachedBody?.body_html ?? thread.body_html;
    const itemBodyText = cachedBody?.body_text ?? thread.body_text;

    const syntheticItem: ActionItem = {
      id: thread.action_item_id || thread.id,
      user_id: thread.user_id,
      thread_id: thread.id,
      account_id: thread.account_id,
      channel: thread.channel,
      type: thread.action_type || 'REPLY_NEEDED',
      priority: thread.priority || 'P2_MEDIUM',
      title: thread.subject_or_title || 'Conversation',
      summary: thread.snippet || '',
      suggested_reply: thread.suggested_reply || '',
      suggested_replies: thread.suggested_replies || [],
      is_completed: thread.status === 'RESOLVED',
      detected_at: thread.last_message_at,
      contact_name: thread.last_message_sender || undefined,
      sender_email: thread.sender_email || undefined,
      full_subject: thread.subject_or_title || undefined,
      body_snippet: thread.snippet || itemBodyText || undefined,
      body_html: itemBodyHtml || undefined,
    };
    setReplyItem(syntheticItem);
  };

  // Toggle thread status between RESOLVED and ACTION_NEEDED (or resolve purged)
  const handleToggleStatus = async (thread: ConversationThread) => {
    const newStatus = thread.status === 'RESOLVED' ? 'ACTION_NEEDED' : 'RESOLVED';
    const originalThreads = threads;

    // Optimistic UI update
    setThreads((prev) =>
      prev.map((t) => (t.id === thread.id ? { ...t, status: newStatus } : t))
    );
    setStatusUpdatingId(thread.id);

    try {
      const res = await fetch(`/api/threads/${thread.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }
    } catch (err: any) {
      console.error('Error updating thread status:', err);
      // Revert on failure
      setThreads(originalThreads);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Restore purged thread to ACTION_NEEDED
  const handleRestoreThread = async (thread: ConversationThread) => {
    const originalThreads = threads;

    // Optimistic UI update
    setThreads((prev) =>
      prev.map((t) => (t.id === thread.id ? { ...t, status: 'ACTION_NEEDED' } : t))
    );
    setStatusUpdatingId(thread.id);

    // If currently filtered by PURGED, advance selectedThreadId to next visible thread
    if (statusFilter === 'PURGED' && selectedThreadId === thread.id) {
      const remaining = filteredThreads.filter((t) => t.id !== thread.id);
      setSelectedThreadId(remaining.length > 0 ? remaining[0].id : null);
    }

    try {
      const res = await fetch(`/api/threads/${thread.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTION_NEEDED' }),
      });

      if (!res.ok) {
        throw new Error('Failed to restore thread');
      }

      setNotification('Conversation restored to Action Needed.');
      setTimeout(() => {
        setNotification((prev) => (prev === 'Conversation restored to Action Needed.' ? null : prev));
      }, 4000);
    } catch (err: any) {
      console.error('Error restoring thread:', err);
      setThreads(originalThreads);
      setNotification('Failed to restore conversation.');
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Handle successful exclusion rule creation
  const handleRuleCreated = (threadId: string) => {
    // Optimistic purge update
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, status: 'PURGED' } : t))
    );

    // If currently selected thread is the one purged, advance to the next visible thread
    if (selectedThreadId === threadId) {
      const remainingThreads = filteredThreads.filter((t) => t.id !== threadId);
      setSelectedThreadId(remainingThreads.length > 0 ? remainingThreads[0].id : null);
    }

    setNotification('Conversation moved to Purged.');
    setTimeout(() => {
      setNotification((prev) => (prev === 'Conversation moved to Purged.' ? null : prev));
    }, 4000);

    fetchData();
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Navigation />

      <main className="w-full flex-1 min-h-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-3 flex flex-col overflow-hidden">
        {/* Top Header & Search Bar */}
        <div className="shrink-0 space-y-2.5 pb-3 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Inbox className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Unified Inboxes</h1>
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
                  {filteredThreads.length}
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-64"
              />
            </div>
          </div>

          {/* Button Filter Clusters (Channel, Priority, Status) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 text-xs">
            {/* Channel Pill Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 hidden sm:inline">Channel:</span>
              <button
                onClick={() => setChannelFilter('ALL')}
                className={`px-2.5 py-1 rounded-xl font-medium transition-all ${
                  channelFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setChannelFilter('email')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  channelFilter === 'email'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Mail className="w-3 h-3 text-indigo-400" />
                <span>Email</span>
              </button>
              <button
                onClick={() => setChannelFilter('whatsapp')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  channelFilter === 'whatsapp'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <MessageCircle className="w-3 h-3 text-emerald-400" />
                <span>WhatsApp</span>
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            {/* Priority Pill Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 hidden sm:inline">Priority:</span>
              <button
                onClick={() => setPriorityFilter('ALL')}
                className={`px-2.5 py-1 rounded-xl font-medium transition-all ${
                  priorityFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setPriorityFilter('P1_HIGH')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  priorityFilter === 'P1_HIGH'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 ring-1 ring-rose-500/30 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>🚨 P1 Urgent</span>
              </button>
              <button
                onClick={() => setPriorityFilter('P2_MEDIUM')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  priorityFilter === 'P2_MEDIUM'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 ring-1 ring-amber-500/30 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>⏳ P2 Action</span>
              </button>
              <button
                onClick={() => setPriorityFilter('P3_LOW')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  priorityFilter === 'P3_LOW'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 ring-1 ring-blue-500/30 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>📌 P3 Low</span>
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            {/* Status Pill Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 hidden sm:inline">Status:</span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-xl font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('ACTION_NEEDED')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  statusFilter === 'ACTION_NEEDED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 ring-1 ring-amber-500/30 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>⚡ Action Needed</span>
              </button>
              <button
                onClick={() => setStatusFilter('RESOLVED')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  statusFilter === 'RESOLVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 ring-1 ring-emerald-500/30 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>✅ Resolved</span>
              </button>
              <button
                onClick={() => setStatusFilter('PURGED')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                  statusFilter === 'PURGED'
                    ? 'bg-slate-700 text-slate-200 border border-slate-600 font-semibold'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>🗑️ Purged</span>
              </button>
            </div>
          </div>
        </div>

        {/* Master-Detail Split Pane: Strict Bounded Flexbox */}
        <div className="w-full flex-1 min-h-0 flex flex-col md:flex-row gap-4 pt-3 overflow-hidden">
          {/* Thread List Column: Rigid Isolated Width & Height */}
          <div
            className={`w-full md:w-[360px] lg:w-[380px] md:min-w-[360px] md:max-w-[380px] h-full min-h-0 shrink-0 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col overflow-hidden ${
              mobileDetailOpen ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-800/80">
              {loading ? (
                <div className="py-20 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Loading conversation threads...</span>
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="py-20 text-center text-slate-500 text-xs p-6">
                  No conversations found matching filters.
                </div>
              ) : (
                filteredThreads.map((thread) => {
                  const isSelected = selectedThread?.id === thread.id;
                  const isWa = thread.channel === 'whatsapp';
                  const isWaGroup = isWa && (thread.external_id?.endsWith('@g.us') || thread.participants?.includes('@g.us'));
                  const isResolved = thread.status === 'RESOLVED';
                  const isUpdating = statusUpdatingId === thread.id;

                  return (
                    <div
                      key={thread.id}
                      onClick={() => handleSelectThread(thread.id)}
                      className={`w-full shrink-0 text-left p-3.5 sm:p-4 transition-all flex flex-col gap-1.5 cursor-pointer relative group ${
                        isSelected
                          ? 'bg-indigo-600/15 border-l-4 border-l-indigo-500'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isWa ? (
                            isWaGroup ? (
                              <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )
                          ) : (
                            <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {thread.last_message_sender || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-500">
                            {new Date(thread.last_message_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>

                          {/* Quick 1-click status resolve/reopen button on card */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (thread.status === 'PURGED') {
                                handleRestoreThread(thread);
                              } else {
                                handleToggleStatus(thread);
                              }
                            }}
                            disabled={isUpdating}
                            title={
                              isResolved
                                ? 'Mark as Action Needed'
                                : thread.status === 'PURGED'
                                ? 'Restore to Action Needed'
                                : 'Mark Done'
                            }
                            className={`p-1 rounded-lg transition-colors ${
                              isResolved
                                ? 'text-emerald-400 hover:text-amber-400 hover:bg-slate-800'
                                : thread.status === 'PURGED'
                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {thread.status === 'PURGED' ? (
                              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <CheckCircle2
                                className={`w-3.5 h-3.5 ${
                                  isResolved ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-400'
                                }`}
                              />
                            )}
                          </button>
                        </div>
                      </div>

                      <h4 className="text-xs font-medium text-slate-100 truncate">
                        {thread.subject_or_title || 'No subject'}
                      </h4>

                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {thread.snippet || thread.body_text || 'No preview available'}
                      </p>

                      {thread.status === 'PURGED' && thread.purge_reason && (
                        <div className="mt-1 text-[11px] text-rose-400/90 truncate flex items-center gap-1">
                          <span className="font-semibold text-rose-400">Purge Reason:</span>
                          <span className="text-slate-400 truncate">{thread.purge_reason}</span>
                        </div>
                      )}

                      {/* Badges line: Priority & Status & Deadline */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {/* Priority Badges */}
                        {thread.priority === 'P1_HIGH' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            🚨 P1 Urgent
                          </span>
                        )}
                        {thread.priority === 'P2_MEDIUM' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ⏳ P2 Action
                          </span>
                        )}
                        {thread.priority === 'P3_LOW' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            📌 P3 Low
                          </span>
                        )}

                        {/* Status Badges */}
                        {thread.status === 'ACTION_NEEDED' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Action Needed
                          </span>
                        )}
                        {thread.status === 'RESOLVED' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Resolved
                          </span>
                        )}
                        {thread.status === 'PURGED' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Purged
                          </span>
                        )}

                        {/* Deadline badge */}
                        {thread.deadline_text && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/80">
                            {thread.deadline_text}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread Detail / Preview Column: Flex-1 Min-w-0 Min-h-0 */}
          <div
            className={`flex-1 min-w-0 min-h-0 h-full bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden ${
              mobileDetailOpen ? 'flex' : 'hidden md:flex'
            }`}
          >
            {selectedThread ? (
              <div className="flex flex-col h-full min-h-0">
                {/* Detail Header (Pinned at top of preview module) */}
                <div className="shrink-0 p-4 sm:p-5 border-b border-slate-800 space-y-3 bg-slate-950/60">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Mobile Back Button */}
                      <button
                        onClick={() => setMobileDetailOpen(false)}
                        className="md:hidden inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium mb-1.5"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Back to all threads</span>
                      </button>

                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedThread.channel === 'whatsapp' && (selectedThread.external_id?.endsWith('@g.us') || selectedThread.participants?.includes('@g.us')) && (
                          <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <h2 className="text-base sm:text-lg font-bold text-white truncate">
                          {selectedThread.subject_or_title || 'Conversation Detail'}
                        </h2>
                        {selectedThread.priority === 'P1_HIGH' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            🚨 P1 Urgent
                          </span>
                        )}
                        {selectedThread.priority === 'P2_MEDIUM' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ⏳ P2 Action
                          </span>
                        )}
                        {selectedThread.priority === 'P3_LOW' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            📌 P3 Low
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 truncate">
                        <span className="font-semibold text-slate-200">
                          {selectedThread.last_message_sender}
                        </span>
                        {selectedThread.sender_email && (
                          <span className="text-slate-500 truncate">&lt;{selectedThread.sender_email}&gt;</span>
                        )}
                      </div>
                    </div>

                    {/* Header Action Buttons: Reply, Mark Done/Reopen, Exclude, Restore */}
                    <div className="flex items-center gap-2 shrink-0">
                      {selectedThread.status === 'PURGED' ? (
                        <button
                          onClick={() => handleRestoreThread(selectedThread)}
                          disabled={statusUpdatingId === selectedThread.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold shadow-sm transition-all"
                          title="Restore conversation to Action Needed"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore to Action Needed</span>
                        </button>
                      ) : (
                        <>
                          {/* Mark Done / Reopen Button */}
                          <button
                            onClick={() => handleToggleStatus(selectedThread)}
                            disabled={statusUpdatingId === selectedThread.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                              selectedThread.status === 'RESOLVED'
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 shadow-sm'
                            }`}
                            title={selectedThread.status === 'RESOLVED' ? 'Reopen thread' : 'Mark as done'}
                          >
                            {selectedThread.status === 'RESOLVED' ? (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reopen</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Done</span>
                              </>
                            )}
                          </button>

                          {/* Exclude Rule Button */}
                          <button
                            onClick={() => setExclusionThread(selectedThread)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 hover:text-white transition-all shadow-sm"
                            title="Add exclusion rule and auto-purge thread"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Exclude...</span>
                          </button>
                        </>
                      )}

                      {/* Reply Button */}
                      <button
                        onClick={() => handleOpenReplyForThread(selectedThread)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition-all"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span>Reply</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(selectedThread.last_message_at).toLocaleString()}
                    </span>
                    <span>•</span>
                    <span className="uppercase font-semibold tracking-wider text-[10px] text-slate-400">
                      Channel: {selectedThread.channel}
                    </span>
                    <span>•</span>
                    <span className="text-[11px] text-slate-400">
                      Status:{' '}
                      <strong className="text-slate-300 uppercase tracking-wide">
                        {selectedThread.status}
                      </strong>
                    </span>
                    {selectedThread.deadline_text && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[11px] text-amber-400">
                          <Clock className="w-3 h-3" />
                          <span>Deadline: {selectedThread.deadline_text}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Detail Body (Independent vertical scroller with media containment) */}
                <div className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto space-y-4 flex flex-col">
                  {selectedThread.status === 'PURGED' && (
                    <div className="shrink-0 p-3.5 sm:p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">Purged Item</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">Non-Actionable</span>
                          </div>
                          <p className="text-xs text-slate-300">
                            <span className="text-slate-400 font-medium">Reason: </span>
                            <span className="text-slate-100 font-semibold">{selectedThread.purge_reason || 'AI auto-purge / excluded communication'}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRestoreThread(selectedThread)}
                        disabled={statusUpdatingId === selectedThread.id}
                        className="shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore to Action Needed</span>
                      </button>
                    </div>
                  )}

                  {loadingBody && !activeBodyHtml && !activeBodyText ? (
                    <div className="space-y-4 animate-pulse p-4">
                      <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-800 rounded w-1/2"></div>
                      <div className="space-y-2 pt-4">
                        <div className="h-3 bg-slate-800/60 rounded w-full"></div>
                        <div className="h-3 bg-slate-800/60 rounded w-5/6"></div>
                        <div className="h-3 bg-slate-800/60 rounded w-4/6"></div>
                      </div>
                    </div>
                  ) : selectedThread.channel === 'email' && activeBodyHtml ? (
                    <EmailHtmlViewer
                      html={activeBodyHtml}
                      className="flex-1 min-h-[500px]"
                    />
                  ) : selectedThread.channel === 'whatsapp' && whatsappMessages ? (
                    <div className="space-y-4 p-1">
                      {whatsappMessages.map((msg: any, idx: number) => {
                        const isMe = Boolean(msg.isFromMe);
                        return (
                          <div
                            key={msg.id || idx}
                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                isMe
                                  ? 'bg-emerald-600/90 text-white rounded-br-xs'
                                  : 'bg-slate-800/90 text-slate-100 rounded-bl-xs border border-slate-700/60'
                              }`}
                            >
                              {!isMe && (
                                <p className="text-[11px] font-semibold text-emerald-400 mb-1">
                                  {msg.sender || selectedThread.last_message_sender}
                                </p>
                              )}
                              <p className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.text}
                              </p>
                              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-300/70">
                                {msg.timestamp && (
                                  <span>
                                    {new Date(msg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </div>
                              {msg.myReaction && (
                                <div className="absolute -bottom-2.5 right-3 px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700/80 shadow-md text-xs flex items-center gap-1 animate-scaleIn">
                                  <span>{msg.myReaction}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-sans break-words bg-slate-950/70 p-5 rounded-xl border border-slate-800">
                      {activeBodyText || selectedThread.snippet || 'No message content.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 text-xs">
                Select a conversation thread from the left to view transcript.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Reply Modal */}
      {replyItem && (
        <ReplyModal
          item={replyItem}
          accounts={accounts}
          onClose={() => setReplyItem(null)}
          onSent={() => {
            fetchData();
          }}
        />
      )}

      {/* Exclusion Modal */}
      <ExclusionModal
        isOpen={Boolean(exclusionThread)}
        thread={exclusionThread}
        onClose={() => setExclusionThread(null)}
        onRuleCreated={handleRuleCreated}
      />

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium text-slate-200">{notification}</span>
        </div>
      )}
    </div>
  );
}
