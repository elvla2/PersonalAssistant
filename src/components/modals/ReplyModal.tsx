'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ActionItem, Account } from '@/types';
import { useRealtime } from '@/components/RealtimeProvider';
import {
  X,
  Send,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Bot,
  Mail,
  MessageCircle,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface ReplyModalProps {
  item: ActionItem | null;
  accounts: Account[];
  initialDraft?: string;
  onClose: () => void;
  onSent: () => void;
}

const TONE_CONFIG = [
  { label: '⚡ Decisive', desc: 'Action / Immediate' },
  { label: '📋 Detailed', desc: 'Inquire / Documentation' },
  { label: '🤝 Holding', desc: 'Courteous / Review' },
];

export default function ReplyModal({
  item,
  accounts,
  initialDraft = '',
  onClose,
  onSent,
}: ReplyModalProps) {
  const { triggerManualRefresh } = useRealtime();
  const isWhatsApp = item?.channel === 'whatsapp';

  // Determine default account
  const defaultAccount =
    accounts.find((a) => a.id === item?.account_id) || accounts[0] || null;

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccount?.id || ''
  );
  const [recipient, setRecipient] = useState(
    isWhatsApp ? item?.contact_name || '' : item?.sender_email || ''
  );
  const [subject, setSubject] = useState(
    item?.full_subject || item?.title ? `Re: ${item.title}` : 'Re: Update'
  );
  const [bodyHtml, setBodyHtml] = useState(initialDraft || '');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);
  const initializedItemIdRef = useRef<string | null>(null);
  const userHasEditedRef = useRef<boolean>(false);
  const currentSignatureRef = useRef<string>('');
  const activeAccountIdRef = useRef<string>(selectedAccountId);

  // Sync initial draft to editor (starts empty unless user specifically passed a draft)
  useEffect(() => {
    if (!item) return;

    // 1. Initial load for this item/modal
    if (initializedItemIdRef.current !== item.id) {
      initializedItemIdRef.current = item.id;
      userHasEditedRef.current = false;
      activeAccountIdRef.current = selectedAccountId;

      const activeAccount = accounts.find((a) => a.id === selectedAccountId);
      const sig = !isWhatsApp && activeAccount?.signature ? activeAccount.signature : '';
      currentSignatureRef.current = sig;

      let initialText = initialDraft || '';
      if (sig) {
        initialText = initialText ? `${initialText}<br><br>${sig}` : `<br><br>${sig}`;
      }

      setBodyHtml(initialText);
      if (editorRef.current) {
        editorRef.current.innerHTML = initialText;
      }
      return;
    }

    // 2. User explicitly switched email account in dropdown
    if (!isWhatsApp && activeAccountIdRef.current !== selectedAccountId) {
      activeAccountIdRef.current = selectedAccountId;
      const activeAccount = accounts.find((a) => a.id === selectedAccountId);
      const newSig = activeAccount?.signature || '';
      const oldSig = currentSignatureRef.current;
      currentSignatureRef.current = newSig;

      if (editorRef.current) {
        let currentHtml = editorRef.current.innerHTML;
        if (oldSig && currentHtml.includes(oldSig)) {
          currentHtml = currentHtml.replace(oldSig, newSig);
        } else if (newSig) {
          currentHtml = currentHtml ? `${currentHtml}<br><br>${newSig}` : `<br><br>${newSig}`;
        }
        editorRef.current.innerHTML = currentHtml;
        setBodyHtml(currentHtml);
      }
      return;
    }

    // CRITICAL INVARIANT: If modal is already open for this item and accounts/heartbeat re-rendered,
    // DO NOT touch editorRef.current.innerHTML! User's active typing is strictly preserved.
  }, [item, initialDraft, selectedAccountId, isWhatsApp, accounts]);

  if (!item) return null;

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBodyHtml(editorRef.current.innerHTML);
    }
  };

  const handleApplySuggestion = (suggestionText: string) => {
    userHasEditedRef.current = true;
    const activeAccount = accounts.find((a) => a.id === selectedAccountId);
    let newContent = suggestionText;
    if (!isWhatsApp && activeAccount?.signature) {
      newContent = `${suggestionText}<br><br>${activeAccount.signature}`;
    }
    setBodyHtml(newContent);
    if (editorRef.current) {
      editorRef.current.innerHTML = newContent;
    }
  };

  const handleSend = async () => {
    const content = editorRef.current?.innerHTML || bodyHtml;
    if (!content.trim()) {
      setErrorMsg('Reply message cannot be empty.');
      return;
    }

    setSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: item.channel,
          recipient: isWhatsApp ? (item.external_id || recipient) : recipient,
          subject,
          content,
          account_id: selectedAccountId || undefined,
          item_id: item.id,
          thread_id: item.thread_id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch reply');
      }

      triggerManualRefresh();
      setSuccessMsg('Reply dispatched successfully!');
      setTimeout(() => {
        onSent();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error sending reply.');
      setSending(false);
    }
  };

  const suggestions =
    item.suggested_replies && item.suggested_replies.length > 0
      ? item.suggested_replies
      : item.suggested_reply
      ? [item.suggested_reply]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              {isWhatsApp ? <MessageCircle className="w-5 h-5 text-emerald-400" /> : <Mail className="w-5 h-5 text-indigo-400" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {isWhatsApp ? 'Send WhatsApp Reply' : 'Send Email Reply'}
              </h2>
              <p className="text-xs text-slate-400">{item.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Account selector for email */}
          {!isWhatsApp && accounts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                From Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipient */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Recipient
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Subject (for email) */}
          {!isWhatsApp && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* AI 3-Tone Suggested Reply Options */}
          {suggestions.length > 0 && (
            <div className="space-y-2 p-3 bg-slate-950/80 rounded-xl border border-indigo-950/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI Suggested Reply (Select Tone):</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">1-click insert</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {suggestions.map((sug, idx) => {
                  const tone = TONE_CONFIG[idx] || { label: `Tone ${idx + 1}`, desc: 'Custom' };
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplySuggestion(sug)}
                      title={sug}
                      className="group flex flex-col items-start p-2.5 rounded-xl bg-slate-900/90 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/50 text-left transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-indigo-300 group-hover:text-indigo-200">
                          {tone.label}
                        </span>
                        <span className="text-[9px] text-slate-500 group-hover:text-indigo-400/80">
                          {tone.desc}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 group-hover:text-slate-200 line-clamp-2 mt-1 leading-snug">
                        {sug}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rich Editor Toolbar */}
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
            <div className="flex items-center gap-1 p-2 border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <button
                type="button"
                onClick={() => executeCommand('bold')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('italic')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('underline')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-800 mx-1" />
              <button
                type="button"
                onClick={() => executeCommand('insertUnorderedList')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('insertOrderedList')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Editable Canvas */}
            <div
              ref={editorRef}
              contentEditable
              onInput={() => {
                userHasEditedRef.current = true;
                if (editorRef.current) setBodyHtml(editorRef.current.innerHTML);
              }}
              className="p-4 min-h-[160px] max-h-[300px] overflow-y-auto text-sm text-slate-100 focus:outline-none"
              data-placeholder="Write your reply..."
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send Reply</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
