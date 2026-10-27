'use client';

import React, { useState } from 'react';
import { ActionItem } from '@/types';
import {
  Mail,
  MessageCircle,
  Clock,
  CheckCircle2,
  Reply,
  MessageSquare,
  Bot,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ActionCardProps {
  item: ActionItem;
  onOpenReply: (item: ActionItem, initialText?: string) => void;
  onToggleComplete: (item: ActionItem) => void;
}

export default function ActionCard({
  item,
  onOpenReply,
  onToggleComplete,
}: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);

  const isCompleted = item.is_completed;
  const isWhatsApp = item.channel === 'whatsapp';

  const priorityConfig = {
    P1_HIGH: {
      label: 'P1 Urgent',
      badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      borderAccent: 'border-l-rose-500 hover:border-rose-500/40',
      dotClass: 'bg-rose-400',
    },
    P2_MEDIUM: {
      label: 'P2 Action',
      badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      borderAccent: 'border-l-amber-500 hover:border-amber-500/40',
      dotClass: 'bg-amber-400',
    },
    P3_LOW: {
      label: 'P3 Low',
      badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      borderAccent: 'border-l-sky-500 hover:border-sky-500/40',
      dotClass: 'bg-sky-400',
    },
    NONE: {
      label: 'Info',
      badgeClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      borderAccent: 'border-l-slate-600 hover:border-slate-500',
      dotClass: 'bg-slate-400',
    },
  }[item.priority || 'P2_MEDIUM'];

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleting(true);
    await onToggleComplete(item);
    setCompleting(false);
  };

  const formattedDate = item.detected_at
    ? new Date(item.detected_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Extract clean suggestions
  const suggestions =
    item.suggested_replies && item.suggested_replies.length > 0
      ? item.suggested_replies
      : item.suggested_reply
      ? [item.suggested_reply]
      : [];

  const topSuggestion = suggestions.length > 0 ? suggestions[0] : null;

  return (
    <div
      className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden border-l-4 ${
        isCompleted
          ? 'bg-slate-900/40 border-slate-800/50 border-l-emerald-500/40 opacity-60'
          : `bg-slate-900/90 border-slate-800/90 ${priorityConfig.borderAccent} shadow-md shadow-black/20`
      }`}
    >
      {/* Rectangular Row Header */}
      <div className="px-4 py-3 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left / Info Cluster */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Top Line: Priority, Channel, Contact, Deadline, Time */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Priority Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${priorityConfig.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dotClass}`} />
              {priorityConfig.label}
            </span>

            {/* Channel Badge */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800/80 border border-slate-700/80 text-slate-300">
              {isWhatsApp ? (
                <>
                  <MessageCircle className="w-3 h-3 text-emerald-400" />
                  <span>WhatsApp</span>
                </>
              ) : (
                <>
                  <Mail className="w-3 h-3 text-indigo-400" />
                  <span>{item.account_name || 'Email'}</span>
                </>
              )}
            </span>

            {/* Sender / Contact */}
            <span className="font-semibold text-slate-100 text-xs sm:text-sm truncate max-w-[220px]">
              {item.contact_name || item.sender_email || 'Contact'}
            </span>

            {item.sender_email && item.contact_name && (
              <span className="text-slate-500 text-[11px] hidden xl:inline truncate max-w-[180px]">
                &lt;{item.sender_email}&gt;
              </span>
            )}

            {/* Deadline Tag */}
            {item.deadline_text && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>{item.deadline_text}</span>
              </span>
            )}

            {/* Time */}
            {formattedDate && (
              <span className="text-[11px] text-slate-500 ml-auto md:ml-0 shrink-0">
                {formattedDate}
              </span>
            )}
          </div>

          {/* Bottom Line: Subject / Title + AI Summary Snippet */}
          <div className="flex items-center gap-2 text-xs min-w-0">
            <h3
              className={`font-semibold shrink-0 max-w-[320px] lg:max-w-[420px] truncate ${
                isCompleted ? 'line-through text-slate-500' : 'text-slate-200'
              }`}
              title={item.title}
            >
              {item.title}
            </h3>

            {item.summary && (
              <p
                className="text-slate-400 text-[11px] sm:text-xs truncate hidden md:inline flex-1"
                title={item.summary}
              >
                <span className="text-slate-600 mr-1.5">•</span>
                <span className="text-indigo-400/90 font-medium mr-1">AI:</span>
                {item.summary}
              </p>
            )}
          </div>
        </div>

        {/* Right / Actions Cluster */}
        <div className="flex items-center gap-2 shrink-0 md:self-center">
          {/* Quick Draft Chip (if top suggestion exists and not completed) */}
          {topSuggestion && !isCompleted && (
            <button
              onClick={() => onOpenReply(item, topSuggestion)}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-xs text-indigo-300 hover:text-white transition-all max-w-[200px] xl:max-w-[260px] truncate group"
              title={`Quick draft: "${topSuggestion}"`}
            >
              <MessageSquare className="w-3 h-3 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate text-[11px]">&quot;{topSuggestion}&quot;</span>
            </button>
          )}

          {/* Standard Reply Button */}
          <button
            onClick={() => onOpenReply(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm shadow-indigo-600/30 transition-all"
            title="Open reply editor"
          >
            <Reply className="w-3.5 h-3.5" />
            <span>Reply</span>
          </button>

          {/* Complete Toggle Button */}
          <button
            onClick={handleToggle}
            disabled={completing}
            className={`p-1.5 rounded-xl border transition-all ${
              isCompleted
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40'
            }`}
            title={isCompleted ? 'Mark as incomplete' : 'Mark as done'}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>

          {/* Expand/Collapse Details Chevron */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-slate-400 hover:text-slate-200 transition-all"
            title={expanded ? 'Hide thread details' : 'View full briefing & transcript'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Details Drawer */}
      {expanded && (
        <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 sm:p-5 space-y-4 animate-fadeIn">
          {/* Full AI Executive Summary */}
          {item.summary && (
            <div className="text-sm text-slate-300 bg-indigo-950/20 rounded-xl p-3.5 border border-indigo-500/20 leading-relaxed">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 mb-1">
                <Bot className="w-3.5 h-3.5" />
                <span>AI Executive Briefing</span>
              </div>
              <p className="text-slate-300 text-xs sm:text-sm">{item.summary}</p>
            </div>
          )}

          {/* All Suggested Replies */}
          {suggestions.length > 0 && !isCompleted && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                <Reply className="w-3 h-3 text-slate-400" />
                <span>Suggested 1-Click Responses:</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((reply, idx) => (
                  <button
                    key={idx}
                    onClick={() => onOpenReply(item, reply)}
                    className="w-full text-left text-xs bg-slate-900/90 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/40 text-slate-200 hover:text-indigo-200 rounded-xl px-3.5 py-2.5 transition-all group flex items-start justify-between gap-3"
                  >
                    <span className="leading-relaxed">{reply}</span>
                    <span className="text-[11px] text-indigo-400 font-medium shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform">
                      Use draft &rarr;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full Message Transcript */}
          {(item.body_snippet || item.body_html) && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-400">Original Transcript:</div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed">
                {item.body_snippet || item.body_html?.replace(/<[^>]+>/g, ' ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
