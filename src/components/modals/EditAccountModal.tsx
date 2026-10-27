'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Account } from '@/types';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Mail,
  ShieldCheck,
  Server,
  Sparkles,
  Clipboard,
  Check,
  ExternalLink,
  Key,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { DiscoveredMailConfig } from '@/lib/autodiscover';
import { openExternalUrl } from '@/lib/desktopBridge';
import { isOAuthCredential } from '@/lib/oauth2';

interface EditAccountModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: (account: Account) => void;
  onAccountDeleted: (id: string) => void;
}

export default function EditAccountModal({
  account,
  isOpen,
  onClose,
  onAccountUpdated,
  onAccountDeleted,
}: EditAccountModalProps) {
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [imapServer, setImapServer] = useState(account?.imap_server || '');
  const [imapPort, setImapPort] = useState(account?.imap_port || 993);
  const [smtpServer, setSmtpServer] = useState(account?.smtp_server || '');
  const [smtpPort, setSmtpPort] = useState(account?.smtp_port || 587);
  const [useSsl, setUseSsl] = useState(account?.use_ssl ?? true);
  const [isEnabled, setIsEnabled] = useState(account?.is_enabled ?? true);
  const [signature, setSignature] = useState(account?.signature || '');

  // Auto-detect & UI state
  const [discovering, setDiscovering] = useState(false);
  const [detectMsg, setDetectMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const [pasteFeedback, setPasteFeedback] = useState(false);

  // Microsoft OAuth2 state
  const [msAuthLoading, setMsAuthLoading] = useState(false);
  const [msAuthUserCode, setMsAuthUserCode] = useState<string | null>(null);
  const [msAuthStatus, setMsAuthStatus] = useState<
    'idle' | 'starting' | 'waiting' | 'authorized' | 'error'
  >('idle');
  const [msAuthError, setMsAuthError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Testing & Save state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (account) {
      setName(account.name);
      setEmail(account.email);
      setPassword('');
      setImapServer(account.imap_server);
      setImapPort(account.imap_port);
      setSmtpServer(account.smtp_server || '');
      setSmtpPort(account.smtp_port || 587);
      setUseSsl(account.use_ssl);
      setIsEnabled(account.is_enabled);
      setSignature(account.signature || '');
      setTestResult(null);
      setErrorMsg('');
      setDetectMsg(null);
      setMsAuthStatus('idle');
      setMsAuthUserCode(null);
      setMsAuthError(null);
    }
  }, [account, isOpen]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  if (!isOpen || !account) return null;

  const lowerEmail = email.toLowerCase();
  const isMicrosoft =
    account.account_type === 'outlook' ||
    lowerEmail.endsWith('@outlook.com') ||
    lowerEmail.endsWith('@hotmail.com') ||
    lowerEmail.endsWith('@live.com') ||
    lowerEmail.endsWith('@msn.com');

  const isCurrentOAuth = isOAuthCredential(password) || isOAuthCredential(account.password);

  const getProviderAuthUrl = (): { url: string; label: string } | null => {
    if (account.account_type === 'gmail' || lowerEmail.endsWith('@gmail.com') || lowerEmail.endsWith('@googlemail.com')) {
      return {
        url: 'https://myaccount.google.com/apppasswords',
        label: 'Open Google to Generate Key',
      };
    }
    if (
      account.account_type === 'icloud' ||
      lowerEmail.endsWith('@icloud.com') ||
      lowerEmail.endsWith('@me.com') ||
      lowerEmail.endsWith('@mac.com')
    ) {
      return {
        url: 'https://account.apple.com/account/manage',
        label: 'Open Apple ID Portal in Browser',
      };
    }
    return null;
  };

  const providerAuth = getProviderAuthUrl();

  const handleStartMicrosoftOAuth = async () => {
    setMsAuthLoading(true);
    setMsAuthStatus('starting');
    setMsAuthError(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/oauth/microsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (!res.ok || !data.device_code) {
        throw new Error(data.error || 'Failed to start Microsoft sign-in.');
      }

      setMsAuthUserCode(data.user_code);
      setMsAuthStatus('waiting');

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(data.user_code).catch(() => {});
      }

      openExternalUrl(data.verification_uri || 'https://microsoft.com/devicelogin');

      const deviceCode = data.device_code;
      const intervalMs = Math.max((data.interval || 3) * 1000, 3000);

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/auth/oauth/microsoft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'poll', device_code: deviceCode }),
          });
          const pollData = await pollRes.json();

          if (pollData.status === 'authorized') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setMsAuthStatus('authorized');
            setMsAuthLoading(false);
            setPassword(pollData.credential);

            if (pollData.email) {
              setEmail(pollData.email);
            }
          } else if (pollData.status === 'expired' || pollData.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setMsAuthStatus('error');
            setMsAuthLoading(false);
            setMsAuthError(pollData.error || 'Sign-in session expired.');
          }
        } catch (pollErr: any) {
          console.warn('Poll error:', pollErr);
        }
      }, intervalMs);
    } catch (err: any) {
      setMsAuthStatus('error');
      setMsAuthLoading(false);
      setMsAuthError(err?.message || 'Failed to initiate Microsoft sign-in');
    }
  };

  const handleCancelMicrosoftOAuth = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setMsAuthStatus('idle');
    setMsAuthLoading(false);
  };

  const handleAutoDetect = async () => {
    if (!email.trim()) return;

    setDiscovering(true);
    setDetectMsg(null);

    try {
      const res = await fetch('/api/accounts/autodiscover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) throw new Error('Auto-discovery failed');

      const data: DiscoveredMailConfig = await res.json();
      if (data.found) {
        setImapServer(data.imap_server);
        setImapPort(data.imap_port);
        setSmtpServer(data.smtp_server || '');
        setSmtpPort(data.smtp_port || 587);
        setUseSsl(data.use_ssl);
        setDetectMsg({
          type: 'success',
          text: `Auto-configured from ${data.providerName}: ${data.imap_server}:${data.imap_port}`,
        });
      } else {
        if (data.imap_server) setImapServer(data.imap_server);
        if (data.smtp_server) setSmtpServer(data.smtp_server);
        setDetectMsg({
          type: 'info',
          text: `No automated discovery record found for ${email}. Kept existing settings.`,
        });
      }
    } catch (err: any) {
      setDetectMsg({
        type: 'info',
        text: err?.message || 'Could not auto-detect server settings.',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handlePasswordPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text');
    const cleaned = raw.replace(/\s+/g, '');
    if (cleaned !== raw) {
      e.preventDefault();
      setPassword(cleaned);
      setPasteFeedback(true);
      setTimeout(() => setPasteFeedback(false), 2500);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        const cleaned = text.replace(/\s+/g, '');
        setPassword(cleaned);
        setPasteFeedback(true);
        setTimeout(() => setPasteFeedback(false), 2500);
      }
    } catch {
      // Ignore clipboard error
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg('');

    try {
      if (!password) {
        // Test using saved credentials in database
        const res = await fetch(`/api/accounts/${account.id}/test`, {
          method: 'POST',
        });
        const data = await res.json();
        setTestResult(data);
        return;
      }

      // Test using new credentials entered in form
      const res = await fetch('/api/accounts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          imap_server: imapServer.trim(),
          imap_port: imapPort,
          smtp_server: smtpServer ? smtpServer.trim() : null,
          smtp_port: smtpPort,
          use_ssl: useSsl,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    try {
      const body: any = {
        name: name.trim(),
        email: email.trim(),
        imap_server: imapServer.trim(),
        imap_port: imapPort,
        smtp_server: smtpServer ? smtpServer.trim() : null,
        smtp_port: smtpPort,
        use_ssl: useSsl,
        is_enabled: isEnabled,
        signature,
      };
      if (password) body.password = password;

      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update account');

      onAccountUpdated(data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to remove account "${account.name}"?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account');
      }
      onAccountDeleted(account.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Edit Account</h2>
              <p className="text-xs text-slate-400">{account.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Account Label
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Microsoft OAuth2 Flow Card (if Outlook/Hotmail) */}
          {isMicrosoft && (
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-950 to-indigo-950/30 border border-indigo-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-200">
                    Microsoft OAuth2 Modern Authentication
                  </span>
                </div>
                {isCurrentOAuth && (
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Authorized
                  </span>
                )}
              </div>

              {msAuthStatus === 'waiting' && msAuthUserCode ? (
                <div className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-center space-y-2">
                  <span className="text-[11px] text-slate-400">Enter code in browser:</span>
                  <div className="text-xl font-mono font-bold tracking-widest text-indigo-300 bg-slate-950 py-1 px-3 rounded-lg border border-slate-800 inline-block select-all">
                    {msAuthUserCode}
                  </div>
                  <p className="text-[11px] text-emerald-400">✓ Code copied to clipboard!</p>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Waiting for browser sign-in...</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => openExternalUrl('https://microsoft.com/devicelogin')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Open microsoft.com/devicelogin ↗
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelMicrosoftOAuth}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    {isCurrentOAuth
                      ? 'Account is authenticated via OAuth2. Re-sign in if credentials expired.'
                      : 'Outlook requires OAuth2 browser authorization instead of an App Password.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleStartMicrosoftOAuth}
                    disabled={msAuthLoading}
                    className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {msAuthLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>{isCurrentOAuth ? 'Re-authorize ↗' : 'Sign in with Microsoft ↗'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Non-Microsoft App Password Shortcut */}
          {!isMicrosoft && providerAuth && (
            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-xs text-indigo-200">Need a new App Password?</span>
              </div>
              <button
                type="button"
                onClick={() => openExternalUrl(providerAuth.url)}
                className="text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/30 hover:bg-indigo-600/60 border border-indigo-500/40 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shrink-0"
              >
                <span>{providerAuth.label}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                New Password (Leave blank to keep existing)
              </label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                title="Paste from clipboard and strip any whitespace"
              >
                <Clipboard className="w-3 h-3" />
                <span>{pasteFeedback ? 'Key Pasted (Cleaned)!' : 'Paste Key'}</span>
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPaste={handlePasswordPaste}
              placeholder={isCurrentOAuth ? '•••••••••••• (Authorized via Microsoft OAuth2)' : '••••••••••••'}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-slate-500">
                Spaces in 16-character keys are automatically removed on paste.
              </p>
              {pasteFeedback && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  <Check className="w-3 h-3" /> Formatted cleanly
                </span>
              )}
            </div>
          </div>

          {/* Server Connection Details */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                <span>Server Connection Details</span>
              </div>

              {/* Auto-Detect Servers Button */}
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={discovering || !email}
                className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                title="Re-query DNS MX & ISPDB to detect optimal servers for this email domain"
              >
                {discovering ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>Auto-Detect Server Config</span>
                  </>
                )}
              </button>
            </div>

            {detectMsg && (
              <div
                className={`p-2.5 rounded-lg text-[11px] flex items-center gap-2 ${
                  detectMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
                }`}
              >
                {detectMsg.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                )}
                <span>{detectMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">IMAP Server</label>
                <input
                  type="text"
                  required
                  value={imapServer}
                  onChange={(e) => setImapServer(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  required
                  value={imapPort}
                  onChange={(e) => setImapPort(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">SMTP Server</label>
                <input
                  type="text"
                  value={smtpServer}
                  onChange={(e) => setSmtpServer(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSsl}
                  onChange={(e) => setUseSsl(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
                SSL/TLS Enabled
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
                Account Active & Syncing
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>Test Connection Credentials</span>
          </button>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
