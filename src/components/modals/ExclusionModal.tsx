'use client';

import React, { useState, useEffect } from 'react';
import { ConversationThread } from '@/types';
import {
  X,
  ShieldAlert,
  User,
  FileText,
  Radio,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface ExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  thread: ConversationThread | null;
  onRuleCreated: (threadId: string, rule: any) => void;
}

export default function ExclusionModal({
  isOpen,
  onClose,
  thread,
  onRuleCreated,
}: ExclusionModalProps) {
  const [ruleType, setRuleType] = useState<'sender' | 'subject'>('sender');
  const [pattern, setPattern] = useState('');
  const [channel, setChannel] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [reason, setReason] = useState('Manual exclusion from thread');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to get default pattern for a given ruleType
  const getPatternForType = (type: 'sender' | 'subject', t: ConversationThread | null) => {
    if (!t) return '';
    if (type === 'sender') {
      return t.sender_email || t.last_message_sender || '';
    } else {
      return (t.subject_or_title || '').replace(/^(re|fwd|fw):\s*/i, '').trim();
    }
  };

  // Sync state whenever modal opens or thread changes
  useEffect(() => {
    if (isOpen && thread) {
      setRuleType('sender');
      setPattern(getPatternForType('sender', thread));
      setChannel('all');
      setReason(`Excluded from thread: ${thread.subject_or_title || thread.id}`);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, thread]);

  // When switching rule type, populate pattern with sensible default
  const handleTypeChange = (newType: 'sender' | 'subject') => {
    setRuleType(newType);
    setPattern(getPatternForType(newType, thread));
  };

  if (!isOpen || !thread) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) {
      setError('Please provide a pattern to exclude.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          rule_type: ruleType,
          pattern: pattern.trim(),
          reason: reason.trim(),
          thread_id: thread.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create exclusion rule');
      }

      onRuleCreated(thread.id, data.rule);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const senderDisplay = thread.sender_email || thread.last_message_sender || 'Unknown sender';
  const subjectDisplay = (thread.subject_or_title || 'No subject').replace(/^(re|fwd|fw):\s*/i, '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Add Exclusion Rule</h3>
              <p className="text-xs text-slate-400">
                Exclude matching messages and automatically purge this thread.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Rule Type Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Exclude By</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Sender */}
              <button
                type="button"
                onClick={() => handleTypeChange('sender')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  ruleType === 'sender'
                    ? 'bg-rose-500/15 border-rose-500/40 text-white shadow-sm ring-1 ring-rose-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <User className="w-3.5 h-3.5 text-rose-400" />
                  <span>Sender</span>
                </div>
                <span className="text-[11px] text-slate-400 truncate w-full" title={senderDisplay}>
                  {senderDisplay}
                </span>
              </button>

              {/* Option 2: Subject */}
              <button
                type="button"
                onClick={() => handleTypeChange('subject')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  ruleType === 'subject'
                    ? 'bg-rose-500/15 border-rose-500/40 text-white shadow-sm ring-1 ring-rose-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span>Subject Contains</span>
                </div>
                <span className="text-[11px] text-slate-400 truncate w-full" title={subjectDisplay}>
                  {subjectDisplay}
                </span>
              </button>
            </div>
          </div>

          {/* Pattern Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {ruleType === 'sender' ? 'Sender Email or Contact to Exclude' : 'Subject Pattern / Keyword'}
            </label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={ruleType === 'sender' ? 'e.g. notifications@newsletter.com' : 'e.g. Invoice summary'}
              required
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
            />
            <p className="text-[11px] text-slate-500">
              {ruleType === 'sender'
                ? 'Matches incoming sender addresses exactly or by prefix.'
                : 'Any incoming message whose subject contains this text will be auto-purged.'}
            </p>
          </div>

          {/* Scope Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Channel Scope</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChannel('all')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium border transition-all ${
                  channel === 'all'
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800/40'
                }`}
              >
                All Channels
              </button>
              <button
                type="button"
                onClick={() => setChannel(thread.channel)}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium border transition-all capitalize ${
                  channel === thread.channel
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800/40'
                }`}
              >
                {thread.channel} Only
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !pattern.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md shadow-rose-600/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Purging...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Confirm & Exclude</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
