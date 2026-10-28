'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from '@/components/RealtimeProvider';
import Logo from '@/components/Logo';
import {
  Inbox,
  MessageCircle,
  ShieldAlert,
  Settings,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Radio,
  Timer,
  Sparkles,
  Download,
  X,
} from 'lucide-react';
import {
  isElectronApp,
  getDesktopUpdateStatus,
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  quitAndInstallDesktopUpdate,
  onDesktopUpdateStatusChange,
  type UpdaterState,
} from '@/lib/desktopBridge';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { triggerManualRefresh } = useRealtime();

  const [syncing, setSyncing] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Desktop in-app update state
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  // Desktop update listener & check on launch
  useEffect(() => {
    if (!isElectronApp()) return;

    getDesktopUpdateStatus().then((status) => {
      if (status?.state) {
        setUpdaterState(status.state);
      }
    });

    const unsubscribe = onDesktopUpdateStatusChange((newState) => {
      setUpdaterState(newState);
      if (newState.status !== 'downloading') {
        setDownloadingUpdate(false);
      }
    });

    // Check online for updates silently in background on desktop launch
    checkDesktopForUpdates().catch(() => {});

    return () => {
      unsubscribe();
    };
  }, []);

  // Sync Frequency Schedule state (in minutes: 0 = Off, 1 = 1m, 2 = 2m, 5 = 5m, 10 = 10m, 15 = 15m)
  const [syncInterval, setSyncInterval] = useState<number>(2);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(120);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);
  const syncIntervalRef = useRef<number>(2);
  syncIntervalRef.current = syncInterval;
  const targetSyncTimeRef = useRef<number>(Date.now() + 120 * 1000);

  // Load saved schedule preference on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('assistant_sync_interval');
      if (saved !== null) {
        const val = Number(saved);
        if (!isNaN(val)) {
          setSyncInterval(val);
          syncIntervalRef.current = val;
          targetSyncTimeRef.current = Date.now() + val * 60 * 1000;
          setSecondsRemaining(val * 60);
          return;
        }
      }
    } catch {}
    // Default: 2 minutes
    setSyncInterval(2);
    syncIntervalRef.current = 2;
    targetSyncTimeRef.current = Date.now() + 120 * 1000;
    setSecondsRemaining(120);
  }, []);

  const handleSyncIntervalChange = (minutes: number) => {
    setSyncInterval(minutes);
    syncIntervalRef.current = minutes;
    targetSyncTimeRef.current = Date.now() + minutes * 60 * 1000;
    setSecondsRemaining(minutes * 60);
    try {
      localStorage.setItem('assistant_sync_interval', String(minutes));
    } catch {}
  };

  const handleSyncNow = async (isAuto = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncing(true);
    if (!isAuto) setStatusMessage(null);

    // Reset countdown
    if (syncIntervalRef.current > 0) {
      targetSyncTimeRef.current = Date.now() + syncIntervalRef.current * 60 * 1000;
      setSecondsRemaining(syncIntervalRef.current * 60);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSyncTime(timeStr);

        if (!data.alreadyRunning) {
          if (!isAuto) {
            setStatusMessage(
              `Synced ${data.emailsProcessed} emails, ${data.whatsappProcessed} chats (${data.actionItemsDetected} action items)`
            );
          } else if (data.emailsProcessed > 0 || data.whatsappProcessed > 0 || data.actionItemsDetected > 0) {
            setStatusMessage(
              `Auto-synced: ${data.emailsProcessed} emails, ${data.whatsappProcessed} chats (${data.actionItemsDetected} action items)`
            );
          }
        }
        triggerManualRefresh();
        router.refresh();
      } else {
        if (!isAuto) {
          setStatusMessage(data.error || 'Sync completed with warnings.');
        }
      }
    } catch (err: any) {
      if (!isAuto) {
        if (err?.name === 'AbortError') {
          setStatusMessage('Sync timed out. Background sync will finish shortly.');
        } else {
          setStatusMessage('Sync failed: ' + (err?.message || 'Network error'));
        }
      }
    } finally {
      clearTimeout(timeoutId);
      isSyncingRef.current = false;
      setSyncing(false);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const handleSyncNowRef = useRef(handleSyncNow);
  handleSyncNowRef.current = handleSyncNow;

  // Background recurring sync timer with timestamp-based precision (zero drift)
  useEffect(() => {
    if (syncInterval <= 0) return;

    targetSyncTimeRef.current = Date.now() + syncInterval * 60 * 1000;
    setSecondsRemaining(syncInterval * 60);

    const timer = setInterval(() => {
      if (syncIntervalRef.current <= 0) return;

      const remainingSecs = Math.max(0, Math.ceil((targetSyncTimeRef.current - Date.now()) / 1000));
      setSecondsRemaining(remainingSecs);

      if (remainingSecs <= 0 && !isSyncingRef.current) {
        targetSyncTimeRef.current = Date.now() + syncIntervalRef.current * 60 * 1000;
        setSecondsRemaining(syncIntervalRef.current * 60);
        handleSyncNowRef.current(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [syncInterval]);

  // Format seconds to mm:ss or ss
  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Perform full page reload to /login to flush in-memory state
    window.location.href = '/login';
  };

  const navLinks = [
    { href: '/', label: 'Inboxes', icon: Inbox },
    { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: waConnected },
    { href: '/rules', label: 'Rules & Purge', icon: ShieldAlert },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="w-full shrink-0 sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-4 lg:gap-6 shrink-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0 whitespace-nowrap hover:opacity-95 transition-all group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 via-slate-900 to-violet-950 border border-indigo-500/30 flex items-center justify-center shadow-md shadow-indigo-950/40 group-hover:border-indigo-400/50 group-hover:scale-105 transition-all">
                <Logo className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-white text-base sm:text-lg font-extrabold tracking-tight">Personal</span>
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent text-base sm:text-lg font-bold tracking-tight">Assistant</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30 ml-0.5 animate-pulse" title="System Active" />
              </div>
            </Link>

            {/* Nav Items */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 shrink-0">
              {navLinks.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href === '/' && pathname === '/inbox');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs lg:text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {item.badge && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 animate-pulse shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Desktop In-App Update Badges */}
            {updaterState.status === 'available' && updaterState.info?.version && updaterState.info.version !== dismissedVersion && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-200 animate-fadeIn shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-semibold text-white whitespace-nowrap text-[11px]">
                  v{updaterState.info.version}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    setDownloadingUpdate(true);
                    await downloadDesktopUpdate();
                  }}
                  disabled={downloadingUpdate}
                  className="ml-1 px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-sm cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedVersion(updaterState.info?.version || null)}
                  className="p-0.5 rounded text-slate-400 hover:text-slate-200 cursor-pointer ml-0.5"
                  title="Dismiss update notice"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {updaterState.status === 'downloading' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 animate-pulse shrink-0">
                <Download className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
                <span className="whitespace-nowrap font-medium text-[11px]">
                  Downloading ({updaterState.progress?.percent || 0}%)
                </span>
              </div>
            )}

            {updaterState.status === 'downloaded' && (
              <button
                type="button"
                onClick={() => quitAndInstallDesktopUpdate()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 text-xs font-bold text-white shadow-md shadow-emerald-900/30 animate-pulse cursor-pointer transition-all shrink-0"
                title="Restart application to apply update"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">Update Ready: Restart Now</span>
              </button>
            )}

            {/* Live Indicator */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 shrink-0">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
              <span className="whitespace-nowrap">Live</span>
            </div>

            {/* Sync Frequency Schedule Dropdown */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 shadow-sm shrink-0">
              <Timer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <select
                value={syncInterval}
                onChange={(e) => handleSyncIntervalChange(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer pr-1"
                title="Automatic background sync schedule"
              >
                <option value={0} className="bg-slate-900 text-slate-200">Sync: Off</option>
                <option value={1} className="bg-slate-900 text-slate-200">Every 1 min</option>
                <option value={2} className="bg-slate-900 text-slate-200">Every 2 mins</option>
                <option value={5} className="bg-slate-900 text-slate-200">Every 5 mins</option>
                <option value={10} className="bg-slate-900 text-slate-200">Every 10 mins</option>
                <option value={15} className="bg-slate-900 text-slate-200">Every 15 mins</option>
              </select>
              {syncInterval > 0 && (
                <span
                  className={`text-[11px] font-mono font-medium pl-1.5 border-l border-slate-700 whitespace-nowrap ${
                    secondsRemaining <= 10 ? 'text-amber-400 animate-pulse' : 'text-indigo-400/90'
                  }`}
                  title={lastSyncTime ? `Next sync in ${secondsRemaining}s • Last synced at ${lastSyncTime}` : `Next sync in ${secondsRemaining}s`}
                >
                  {formatCountdown(secondsRemaining)}
                </span>
              )}
            </div>

            {/* Sync Now Button */}
            <button
              onClick={() => handleSyncNow(false)}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-semibold text-indigo-300 hover:text-white transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Trigger instant IMAP and WhatsApp sync"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="whitespace-nowrap">{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {statusMessage && (
        <div className="bg-indigo-950/60 border-t border-indigo-500/20 px-4 py-2 text-xs text-indigo-300 flex items-center justify-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
    </header>
  );
}
