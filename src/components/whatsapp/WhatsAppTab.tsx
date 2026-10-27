'use client';

import React, { useState, useEffect } from 'react';
import { useRealtime } from '@/components/RealtimeProvider';
import {
  MessageCircle,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  Smartphone,
  RefreshCw,
} from 'lucide-react';

export default function WhatsAppTab() {
  const { lastUpdated } = useRealtime();
  const [status, setStatus] = useState<{
    connected: boolean;
    qrDataUrl?: string | null;
    user?: { id: string; name: string } | null;
    cachedChatsCount?: number;
  }>({ connected: false });

  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status?init=true');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e: any) {
      console.warn('WhatsApp status fetch warning:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleDisconnect = async () => {
    if (!confirm('Disconnect WhatsApp session? You will need to scan QR code again.')) return;
    setDisconnecting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/whatsapp/status', { method: 'POST' });
      if (res.ok) {
        setStatus({ connected: false, qrDataUrl: null, user: null });
        fetchStatus();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error disconnecting session');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">WhatsApp Web Bridge</h2>
              <p className="text-xs text-slate-400">
                Connect your WhatsApp to triage chats and 1-click reply
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                status.connected
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : status.qrDataUrl
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.connected
                    ? 'bg-emerald-400 animate-pulse'
                    : status.qrDataUrl
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              {status.connected
                ? 'Connected'
                : status.qrDataUrl
                ? 'Scan QR Code'
                : 'Connecting...'}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* State 1: Connected */}
        {status.connected && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-950 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    {status.user?.name || 'Linked WhatsApp Account'}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono">
                    +{status.user?.id || 'Connected Device'}
                  </p>
                  <p className="text-[11px] text-emerald-400/90 mt-0.5">
                    Live background sync active ({status.cachedChatsCount || 0} active conversations monitored)
                  </p>
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all"
              >
                {disconnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}

        {/* State 2: QR Code Available */}
        {!status.connected && status.qrDataUrl && (
          <div className="flex flex-col items-center justify-center p-6 space-y-5 text-center">
            <div className="p-4 bg-white rounded-2xl shadow-xl border border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={status.qrDataUrl}
                alt="WhatsApp QR Code"
                className="w-64 h-64 rounded-lg"
              />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-base font-semibold text-slate-100">
                Scan QR Code with WhatsApp
              </h3>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside text-left bg-slate-950 p-4 rounded-xl border border-slate-800">
                <li>Open WhatsApp on your mobile phone</li>
                <li>Tap <b>Settings</b> or <b>Three Dots</b> &gt; <b>Linked Devices</b></li>
                <li>Tap <b>Link a Device</b> and point your camera at this screen</li>
              </ol>
            </div>
          </div>
        )}

        {/* State 3: Starting or Disconnected without QR */}
        {!status.connected && !status.qrDataUrl && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm font-semibold text-slate-200">Starting WhatsApp Gateway...</p>
            <p className="text-xs text-slate-500">
              Initializing cryptographic auth state and generating QR code.
            </p>
            <button
              onClick={fetchStatus}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Status</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
