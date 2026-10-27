'use client';

import React, { useState, useEffect } from 'react';
import { ExclusionRule, AiPurgeLogItem } from '@/types';
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function RulesTab() {
  const [activeTab, setActiveTab] = useState<'rules' | 'purge_log'>('rules');

  // Rules state
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleType, setRuleType] = useState<'sender' | 'subject' | 'keyword' | 'domain'>('sender');
  const [ruleChannel, setRuleChannel] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [ruleReason, setRuleReason] = useState('');
  const [addingRule, setAddingRule] = useState(false);
  const [rulesPage, setRulesPage] = useState(1);
  const rulesPerPage = 6;

  // Purge log state
  const [purgeLog, setPurgeLog] = useState<AiPurgeLogItem[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [logPage, setLogPage] = useState(1);
  const logPerPage = 7;

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch {}
    setLoadingRules(false);
  };

  const fetchPurgeLog = async () => {
    setLoadingLog(true);
    try {
      const res = await fetch('/api/purge-log');
      if (res.ok) {
        const data = await res.json();
        setPurgeLog(data);
      }
    } catch {}
    setLoadingLog(false);
  };

  useEffect(() => {
    fetchRules();
  }, []);

  useEffect(() => {
    if (activeTab === 'purge_log') {
      fetchPurgeLog();
    }
  }, [activeTab]);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulePattern.trim()) return;

    setAddingRule(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: rulePattern.trim(),
          rule_type: ruleType,
          channel: ruleChannel,
          reason: ruleReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add rule');

      setRulePattern('');
      setRuleReason('');
      fetchRules();

      setNotification({
        type: 'success',
        text: `Rule created successfully! Purged ${data.purgedCount || 0} existing matching item(s).`,
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      setNotification({ type: 'error', text: err?.message || 'Error adding rule' });
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this exclusion rule?')) return;
    try {
      const res = await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {}
  };

  const handleToggleRule = async (id: string, current: boolean) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !current }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r))
        );
      }
    } catch {}
  };

  const handleRestore = async (item: AiPurgeLogItem) => {
    setRestoringId(item.id);
    try {
      const res = await fetch('/api/purge-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: item.id, thread_id: item.thread_id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore item');

      setPurgeLog((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, restored: true } : p))
      );

      setNotification({
        type: 'success',
        text: 'Item successfully restored to your active Briefing & Inboxes!',
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      setNotification({ type: 'error', text: err?.message || 'Error restoring item' });
    } finally {
      setRestoringId(null);
    }
  };

  const filteredPurgeLog = purgeLog.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.sender || '').toLowerCase().includes(q) ||
      (item.subject_or_snippet || '').toLowerCase().includes(q) ||
      (item.reason || '').toLowerCase().includes(q)
    );
  });

  // Pagination calculations
  const totalRulesPages = Math.max(1, Math.ceil(rules.length / rulesPerPage));
  const paginatedRules = rules.slice((rulesPage - 1) * rulesPerPage, rulesPage * rulesPerPage);

  const totalLogPages = Math.max(1, Math.ceil(filteredPurgeLog.length / logPerPage));
  const paginatedPurgeLog = filteredPurgeLog.slice((logPage - 1) * logPerPage, logPage * logPerPage);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden space-y-4">
      {/* Top Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3 shrink-0">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'rules'
              ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Exclusion Rules</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-300">
            {rules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('purge_log')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'purge_log'
              ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>AI Auto-Purge Review</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-300">
            {purgeLog.length}
          </span>
        </button>
      </div>

      {notification && (
        <div
          className={`shrink-0 p-3.5 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* TAB 1: RULES */}
      {activeTab === 'rules' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Add New Rule Card */}
          <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Add Exclusion Rule</h3>
              <p className="text-xs text-slate-400">
                Incoming communications matching this pattern will be filtered out automatically.
              </p>
            </div>

            <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Rule Target
                </label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="sender">Sender Email / Name</option>
                  <option value="domain">Email Domain (@company.com)</option>
                  <option value="subject">Subject Line</option>
                  <option value="keyword">Keyword in Body</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Channel
                </label>
                <select
                  value={ruleChannel}
                  onChange={(e) => setRuleChannel(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Channels</option>
                  <option value="email">Email Only</option>
                  <option value="whatsapp">WhatsApp Only</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Pattern / Match String
                </label>
                <input
                  type="text"
                  required
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                  placeholder="e.g. promo@, newsletter, receipt, etc."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Reason / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={ruleReason}
                  onChange={(e) => setRuleReason(e.target.value)}
                  placeholder="e.g. Marketing spam or internal broadcasts"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingRule}
                  className="w-full py-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  {addingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Add Rule</span>
                </button>
              </div>
            </form>
          </div>

          {/* Rules List Container */}
          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h4 className="text-sm font-semibold text-slate-200">Active Rules</h4>
              <span className="text-xs text-slate-400">Total: {rules.length}</span>
            </div>

            {loadingRules ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Loading rules...
              </div>
            ) : rules.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                No exclusion rules configured.
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {paginatedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      rule.is_active
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/40 border-slate-850 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rule.is_active}
                        onChange={() => handleToggleRule(rule.id, rule.is_active)}
                        className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                        title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-slate-100">
                            {rule.pattern}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 uppercase">
                            {rule.rule_type}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 uppercase">
                            {rule.channel}
                          </span>
                          {rule.is_system && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              System
                            </span>
                          )}
                        </div>
                        {rule.reason && (
                          <p className="text-xs text-slate-400 mt-0.5">{rule.reason}</p>
                        )}
                      </div>
                    </div>

                    {!rule.is_system && (
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {rules.length > rulesPerPage && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800 shrink-0 text-xs text-slate-400">
                <span>
                  Showing {Math.min((rulesPage - 1) * rulesPerPage + 1, rules.length)} -{' '}
                  {Math.min(rulesPage * rulesPerPage, rules.length)} of {rules.length} rules
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRulesPage((p) => Math.max(1, p - 1))}
                    disabled={rulesPage === 1}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <span className="text-slate-300 font-medium px-1">
                    {rulesPage} / {totalRulesPages}
                  </span>
                  <button
                    onClick={() => setRulesPage((p) => Math.min(totalRulesPages, p + 1))}
                    disabled={rulesPage === totalRulesPages}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI AUTO-PURGE REVIEW */}
      {activeTab === 'purge_log' && (
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">AI Auto-Purge Inspection</h3>
              <p className="text-xs text-slate-400">
                Review items categorized as automated noise or non-actionable closures. Restore any with 1 click.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setLogPage(1);
                }}
                placeholder="Search purge log..."
                className="pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              />
            </div>
          </div>

          {loadingLog ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Loading purge log...
            </div>
          ) : filteredPurgeLog.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              No auto-purged items found.
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {paginatedPurgeLog.map((log) => (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    log.restored
                      ? 'bg-slate-950/40 border-slate-850 opacity-60'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="p-1 rounded bg-slate-800 text-slate-400">
                        {log.channel === 'whatsapp' ? (
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Mail className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {log.sender || 'Unknown Sender'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(log.purged_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {log.restored && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Restored
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-300 truncate">
                      {log.subject_or_snippet || 'No subject'}
                    </p>
                    <p className="text-xs text-rose-400/90 font-mono">
                      Reason: {log.reason || 'Classified as non-actionable'}
                    </p>
                  </div>

                  {!log.restored && (
                    <button
                      onClick={() => handleRestore(log)}
                      disabled={restoringId === log.id}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all disabled:opacity-50 self-start sm:self-auto"
                    >
                      {restoringId === log.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Restore to Inboxes</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {filteredPurgeLog.length > logPerPage && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800 shrink-0 text-xs text-slate-400">
              <span>
                Showing {Math.min((logPage - 1) * logPerPage + 1, filteredPurgeLog.length)} -{' '}
                {Math.min(logPage * logPerPage, filteredPurgeLog.length)} of {filteredPurgeLog.length} items
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={logPage === 1}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="text-slate-300 font-medium px-1">
                  {logPage} / {totalLogPages}
                </span>
                <button
                  onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                  disabled={logPage === totalLogPages}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
