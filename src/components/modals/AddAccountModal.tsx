'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Account, AccountType } from '@/types';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  ShieldCheck,
  Server,
  Sparkles,
  ExternalLink,
  Clipboard,
  ChevronDown,
  ChevronUp,
  Check,
  Key,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { DiscoveredMailConfig } from '@/lib/autodiscover';
import { openExternalUrl } from '@/lib/desktopBridge';
import { isOAuthCredential } from '@/lib/oauth2';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (account: Account) => void;
}

const PRESETS: Record<
  AccountType,
  {
    name: string;
    imapServer: string;
    imapPort: number;
    smtpServer: string;
    smtpPort: number;
    authUrl?: string;
    authButtonLabel?: string;
    authHint?: string;
  }
> = {
  gmail: {
    name: 'Gmail',
    imapServer: 'imap.gmail.com',
    imapPort: 993,
    smtpServer: 'smtp.gmail.com',
    smtpPort: 587,
    authUrl: 'https://myaccount.google.com/apppasswords',
    authButtonLabel: 'Open Google to Generate Key',
    authHint:
      'Sign in to Google in your browser, create an App Password named "Personal Assistant", and paste the 16-letter key below.',
  },
  outlook: {
    name: 'Outlook / Office 365',
    imapServer: 'outlook.office365.com',
    imapPort: 993,
    smtpServer: 'smtp.office365.com',
    smtpPort: 587,
    authUrl: 'https://microsoft.com/devicelogin',
    authButtonLabel: 'Sign in with Microsoft in Browser',
    authHint:
      'Use 1-Click Microsoft OAuth2 Browser Sign-In below to authorize without requiring an App Password.',
  },
  icloud: {
    name: 'iCloud Mail',
    imapServer: 'imap.mail.me.com',
    imapPort: 993,
    smtpServer: 'smtp.mail.me.com',
    smtpPort: 587,
    authUrl: 'https://account.apple.com/account/manage',
    authButtonLabel: 'Open Apple ID Portal in Browser',
    authHint:
      'Sign in to Apple ID -> App-Specific Passwords -> Generate a password and paste it below.',
  },
  custom_imap: {
    name: 'Custom IMAP / SMTP',
    imapServer: '',
    imapPort: 993,
    smtpServer: '',
    smtpPort: 587,
  },
};

export default function AddAccountModal({
  isOpen,
  onClose,
  onAccountAdded,
}: AddAccountModalProps) {
  const [accountType, setAccountType] = useState<AccountType>('gmail');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [imapServer, setImapServer] = useState(PRESETS.gmail.imapServer);
  const [imapPort, setImapPort] = useState(PRESETS.gmail.imapPort);
  const [smtpServer, setSmtpServer] = useState(PRESETS.gmail.smtpServer);
  const [smtpPort, setSmtpPort] = useState(PRESETS.gmail.smtpPort);
  const [useSsl, setUseSsl] = useState(true);
  const [signature, setSignature] = useState('');

  // Auto-discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveryConfig, setDiscoveryConfig] = useState<DiscoveredMailConfig | null>(null);
  const [autoConfigured, setAutoConfigured] = useState(true);
  const [showAdvancedServers, setShowAdvancedServers] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState(false);
  const lastDiscoveredEmailRef = useRef('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Microsoft OAuth2 state
  const [msAuthLoading, setMsAuthLoading] = useState(false);
  const [msAuthUserCode, setMsAuthUserCode] = useState<string | null>(null);
  const [msAuthStatus, setMsAuthStatus] = useState<
    'idle' | 'starting' | 'waiting' | 'authorized' | 'error'
  >('idle');
  const [msAuthError, setMsAuthError] = useState<string | null>(null);
  const [showManualPassword, setShowManualPassword] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Testing & Saving state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const triggerAutodiscover = useCallback(async (targetEmail: string, force = false) => {
    const trimmed = (targetEmail || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return;
    }
    if (!force && lastDiscoveredEmailRef.current === trimmed) {
      return;
    }

    lastDiscoveredEmailRef.current = trimmed;
    setDiscovering(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/accounts/autodiscover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        throw new Error('Auto-discovery request failed');
      }

      const config: DiscoveredMailConfig = await res.json();
      setDiscoveryConfig(config);

      if (config.found) {
        setImapServer(config.imap_server);
        setImapPort(config.imap_port);
        setSmtpServer(config.smtp_server || '');
        setSmtpPort(config.smtp_port || 587);
        setUseSsl(config.use_ssl);

        if (
          config.providerId === 'gmail' ||
          config.providerId === 'outlook' ||
          config.providerId === 'icloud'
        ) {
          setAccountType(config.providerId);
        } else {
          setAccountType('custom_imap');
        }

        setName((prev) => (prev.trim() ? prev : config.providerName));
        setAutoConfigured(true);
        setShowAdvancedServers(false);
      } else {
        setAutoConfigured(false);
        setShowAdvancedServers(true);
        if (config.imap_server) setImapServer(config.imap_server);
        if (config.smtp_server) setSmtpServer(config.smtp_server);
      }
    } catch (err: any) {
      console.warn('Auto-discovery error:', err);
    } finally {
      setDiscovering(false);
    }
  }, []);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    const trimmed = val.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (emailRegex.test(trimmed)) {
      debounceTimerRef.current = setTimeout(() => {
        triggerAutodiscover(trimmed);
      }, 500);
    }
  };

  const handleSelectPreset = (type: AccountType) => {
    setAccountType(type);
    const p = PRESETS[type];
    if (p.imapServer) setImapServer(p.imapServer);
    if (p.imapPort) setImapPort(p.imapPort);
    if (p.smtpServer) setSmtpServer(p.smtpServer);
    if (p.smtpPort) setSmtpPort(p.smtpPort);
    if (type !== 'custom_imap') {
      setAutoConfigured(true);
      setShowAdvancedServers(false);
    } else {
      setAutoConfigured(false);
      setShowAdvancedServers(true);
    }
    setTestResult(null);
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
      // Ignore clipboard read errors
    }
  };

  // Microsoft OAuth2 Device Code Browser Flow
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

      // Copy user code to clipboard automatically
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(data.user_code).catch(() => {});
      }

      // Open verification URI in default browser
      openExternalUrl(data.verification_uri || 'https://microsoft.com/devicelogin');

      // Poll every 3 seconds for user authorization
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
              setEmail((prev) => prev.trim() || pollData.email);
              setName((prev) => prev.trim() || `Outlook (${pollData.email})`);
            } else {
              setName((prev) => prev.trim() || 'Microsoft Outlook');
            }
          } else if (pollData.status === 'expired' || pollData.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setMsAuthStatus('error');
            setMsAuthLoading(false);
            setMsAuthError(pollData.error || 'Sign-in session expired. Please try again.');
          }
        } catch (pollErr: any) {
          console.warn('Microsoft OAuth poll error:', pollErr);
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

  const handleTestConnection = async () => {
    if (!email || !password || !imapServer) {
      setErrorMsg('Please enter email, password / authorization, and IMAP server to test.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setErrorMsg('');

    try {
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
    if (!name.trim() || !email.trim() || !password || !imapServer) {
      setErrorMsg('Please complete all required fields (email, authorization, and server).');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          account_type: accountType,
          email: email.trim(),
          imap_server: imapServer.trim(),
          imap_port: imapPort,
          smtp_server: smtpServer ? smtpServer.trim() : null,
          smtp_port: smtpPort,
          password,
          signature,
          use_ssl: useSsl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save account');
      }

      onAccountAdded(data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add account.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const lowerEmail = email.toLowerCase();
  const isMicrosoft =
    accountType === 'outlook' ||
    lowerEmail.endsWith('@outlook.com') ||
    lowerEmail.endsWith('@hotmail.com') ||
    lowerEmail.endsWith('@live.com') ||
    lowerEmail.endsWith('@msn.com') ||
    discoveryConfig?.providerId === 'outlook';

  const isOAuthConnected = isOAuthCredential(password);

  const currentAuthUrl = discoveryConfig?.authUrl || PRESETS[accountType]?.authUrl;
  const currentAuthButtonLabel =
    discoveryConfig?.authButtonLabel ||
    PRESETS[accountType]?.authButtonLabel ||
    'Open Security Portal in Browser';
  const currentAuthHint =
    discoveryConfig?.authHint ||
    PRESETS[accountType]?.authHint ||
    'Generate an App Password in your account settings and paste it below.';

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
              <h2 className="text-base font-semibold text-slate-100">Connect Email Account</h2>
              <p className="text-xs text-slate-400">Add an IMAP/SMTP mailbox with Modern Auth</p>
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

          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Account Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(PRESETS) as AccountType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleSelectPreset(type)}
                  className={`p-2.5 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                    accountType === type
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {PRESETS[type].name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Email Address & Auto-Detect */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Email Address
                </label>
                <button
                  type="button"
                  onClick={() => triggerAutodiscover(email, true)}
                  disabled={discovering || !email}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors disabled:opacity-40 cursor-pointer"
                  title="Detect mail server settings from domain"
                >
                  {discovering ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Detecting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      <span>Auto-Detect</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => triggerAutodiscover(email)}
                  placeholder="you@domain.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none pr-8"
                />
                {discovering && (
                  <div className="absolute right-2.5 top-2.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Account Label
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Work Email, Personal Gmail"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Microsoft OAuth2 Flow Card (for Outlook / Microsoft accounts) */}
          {isMicrosoft ? (
            <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/70 via-slate-900 to-indigo-950/40 border border-indigo-500/40 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">
                      Microsoft Modern Authentication (OAuth2)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Sign in directly via your browser. No App Password required.
                    </p>
                  </div>
                </div>

                {isOAuthConnected && (
                  <span className="shrink-0 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Authorized
                  </span>
                )}
              </div>

              {isOAuthConnected ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-emerald-500/20">
                  <div className="text-[11px] text-emerald-300">
                    ✓ Connected to Microsoft Entra. IMAP and SMTP tokens refresh automatically.
                  </div>
                  <button
                    type="button"
                    onClick={handleStartMicrosoftOAuth}
                    disabled={msAuthLoading}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors cursor-pointer shrink-0 ml-2"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Re-authorize</span>
                  </button>
                </div>
              ) : msAuthStatus === 'waiting' && msAuthUserCode ? (
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-indigo-500/30 text-center space-y-2.5">
                  <span className="text-[11px] text-slate-400 block">
                    Enter this verification code in the opened browser window:
                  </span>
                  <div className="text-2xl font-mono font-bold tracking-widest text-indigo-300 bg-slate-900 py-1.5 px-4 rounded-lg border border-slate-800 inline-block shadow-inner select-all">
                    {msAuthUserCode}
                  </div>
                  <p className="text-[11px] text-emerald-400 font-medium">
                    ✓ Code copied to clipboard automatically!
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-300 pt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Waiting for you to complete sign-in in your browser...</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => openExternalUrl('https://microsoft.com/devicelogin')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                    >
                      Reopen login page (microsoft.com/devicelogin) ↗
                    </button>
                    <span className="text-slate-600">•</span>
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
                <div className="space-y-2">
                  {msAuthError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{msAuthError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleStartMicrosoftOAuth}
                    disabled={msAuthLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {msAuthLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Connecting to Microsoft...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        <span>Sign in with Microsoft (Browser OAuth2) ↗</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Optional manual password toggle */}
              <div className="text-right pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualPassword(!showManualPassword)}
                  className="text-[11px] text-slate-400 hover:text-slate-300 underline transition-colors cursor-pointer"
                >
                  {showManualPassword
                    ? 'Hide manual password input'
                    : 'Use manual password / App Password instead'}
                </button>
              </div>
            </div>
          ) : (
            /* Non-Microsoft 1-Click Browser Authorization Card (Gmail, iCloud, Yahoo, etc.) */
            currentAuthUrl && (
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-950 to-indigo-950/30 border border-indigo-500/30 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-indigo-200">
                        1-Click Browser Authorization
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Open security portal directly to generate an App Password
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openExternalUrl(currentAuthUrl)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>{currentAuthButtonLabel}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
                  {currentAuthHint}
                </div>
              </div>
            )
          )}

          {/* Password Input (Shown for non-Microsoft OR if manual password toggle is enabled) */}
          {(!isMicrosoft || showManualPassword || !isOAuthConnected) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isMicrosoft
                    ? 'Account Password or App Password'
                    : 'Password or App Password'}
                </label>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                  title="Paste from clipboard and strip any whitespace"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>{pasteFeedback ? 'Key Pasted (Cleaned)!' : 'Paste Key from Clipboard'}</span>
                </button>
              </div>
              <input
                type="password"
                required={!isOAuthConnected}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onPaste={handlePasswordPaste}
                placeholder={isOAuthConnected ? '•••••••••••• (Authorized via Microsoft OAuth2)' : '••••••••••••'}
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
          )}

          {/* Server Connection Details Card */}
          <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-300">Server Connection Details</span>
              </div>

              <div className="flex items-center gap-2">
                {autoConfigured && imapServer && (
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    Auto-Configured
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowAdvancedServers(!showAdvancedServers)}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{showAdvancedServers ? 'Hide Details' : 'Customize Server Ports'}</span>
                  {showAdvancedServers ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Compact Summary Pill when collapsed */}
            {!showAdvancedServers && imapServer && (
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/60 text-[11px] text-slate-300 flex items-center justify-between font-mono">
                <div className="truncate">
                  <span className="text-indigo-300 font-semibold">
                    {imapServer}:{imapPort}
                  </span>
                  <span className="text-slate-500 mx-2">•</span>
                  <span className="text-slate-300">
                    {smtpServer || 'No SMTP'}:{smtpPort}
                  </span>
                  <span className="text-slate-500 mx-2">•</span>
                  <span className={useSsl ? 'text-emerald-400' : 'text-amber-400'}>
                    {useSsl ? 'SSL/TLS' : 'Plain'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedServers(true)}
                  className="text-indigo-400 hover:text-indigo-300 ml-2 shrink-0 font-sans text-[11px] cursor-pointer"
                >
                  Edit
                </button>
              </div>
            )}

            {discoveryConfig && !discoveryConfig.found && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Could not auto-detect standard servers for this domain. Please verify settings
                  below.
                </span>
              </div>
            )}

            {/* Expanded Server Details Form */}
            {showAdvancedServers && (
              <div className="space-y-3 pt-1 border-t border-slate-800/60">
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

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="useSsl"
                    checked={useSsl}
                    onChange={(e) => setUseSsl(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="useSsl" className="text-xs text-slate-300">
                    Enable SSL/TLS Encryption
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Test Connection Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || (!password && !isOAuthConnected)}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Testing mailbox credentials & tokens...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Test Connection Credentials</span>
                </>
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
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
              disabled={saving || (!password && !isOAuthConnected)}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save & Connect Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
