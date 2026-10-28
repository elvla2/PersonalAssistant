'use client';

import React, { useState, useEffect, useRef } from 'react';
import Navigation from '@/components/Navigation';
import AddAccountModal from '@/components/modals/AddAccountModal';
import EditAccountModal from '@/components/modals/EditAccountModal';
import RichSignatureEditor from '@/components/settings/RichSignatureEditor';
import { useRealtime } from '@/components/RealtimeProvider';
import { createClient } from '@/lib/supabase/client';
import { Account, UserSetting } from '@/types';
import {
  Mail,
  Plus,
  Edit2,
  Key,
  User,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PenTool,
  ExternalLink,
  Cpu,
  Globe,
  Activity,
  Download,
  RefreshCw,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import {
  isElectronApp,
  getDesktopUpdateStatus,
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  quitAndInstallDesktopUpdate,
  installDesktopLocalUpdateFile,
  onDesktopUpdateStatusChange,
  type UpdaterState,
} from '@/lib/desktopBridge';

export default function SettingsPage() {
  const { lastUpdated } = useRealtime();
  const supabase = createClient();
  const isInitialLoadRef = useRef(true);

  const [activeTab, setActiveTab] = useState<'accounts' | 'signatures' | 'ai' | 'updates'>('accounts');

  // App Updates state
  const [isDesktop, setIsDesktop] = useState(false);
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [installingLocal, setInstallingLocal] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<UserSetting | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Settings form state
  const [displayName, setDisplayName] = useState('');
  const [userAliases, setUserAliases] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('');
  const [llmModel, setLlmModel] = useState('ollama/llama3.2');
  const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(true);

  // Ollama local health status
  const [ollamaStatus, setOllamaStatus] = useState<{
    online: boolean;
    models: string[];
    loading: boolean;
  }>({
    online: false,
    models: [],
    loading: true,
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<
    Record<string, { success: boolean; message: string; imapMs?: number; smtpMs?: number }>
  >({});

  const fetchData = async () => {
    try {
      // 1. Fetch accounts
      const accRes = await fetch('/api/accounts');
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData);
      }

      // 2. Fetch user settings
      const setRes = await fetch('/api/settings');
      if (setRes.ok) {
        const setData: UserSetting = await setRes.json();
        setSettings(setData);

        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          setDisplayName(setData.display_name || '');
          setUserAliases((setData.user_aliases || []).join(', '));
          const rawKey = setData.gemini_api_key || '';
          setGeminiApiKey(rawKey);
          if (rawKey.startsWith('{')) {
            try {
              const parsed = JSON.parse(rawKey);
              setOllamaEndpoint(parsed.endpoint || '');
              setOllamaApiKey(parsed.apiKey || parsed.key || '');
            } catch {
              setOllamaApiKey(rawKey);
            }
          } else if (rawKey.startsWith('http')) {
            setOllamaEndpoint(rawKey);
            setOllamaApiKey('');
          } else {
            setOllamaApiKey(rawKey);
            setOllamaEndpoint('');
          }
          const loadedModel =
            setData.llm_model === 'ollama/beam'
              ? 'ollama/beam:cloud'
              : (setData.llm_model || 'ollama/llama3.2');
          setLlmModel(loadedModel);
          setAutoPurgeEnabled(setData.auto_purge_enabled !== false);
        }
      }
    } catch (e: any) {
      console.warn('Settings load warning:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const checkOllama = async () => {
      try {
        const res = await fetch('/api/ollama/status');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setOllamaStatus({
              online: Boolean(data.online),
              models: data.models || [],
              loading: false,
            });
          }
        } else {
          if (mounted) setOllamaStatus((prev) => ({ ...prev, loading: false, online: false }));
        }
      } catch {
        if (mounted) setOllamaStatus((prev) => ({ ...prev, loading: false, online: false }));
      }
    };
    checkOllama();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [lastUpdated]);

  useEffect(() => {
    setIsDesktop(isElectronApp());
    if (isElectronApp()) {
      getDesktopUpdateStatus().then((status) => {
        if (status) {
          if (status.currentVersion) {
            setAppVersion(`v${status.currentVersion}`);
          }
          if (status.state) {
            setUpdaterState(status.state);
          }
        }
      });

      const unsubscribe = onDesktopUpdateStatusChange((newState) => {
        setUpdaterState(newState);
      });
      return () => unsubscribe();
    }
  }, []);

  const handleCheckForUpdates = async () => {
    if (!isDesktop) {
      setUpdateMsg({
        type: 'info',
        text: 'In-app auto updates are supported when running the desktop app.',
      });
      return;
    }
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      const res = await checkDesktopForUpdates();
      if (!res?.success) {
        setUpdateMsg({
          type: 'error',
          text: res?.error || 'Failed to check for updates.',
        });
      }
    } catch (err: any) {
      setUpdateMsg({ type: 'error', text: err?.message || 'Update check failed.' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloadingUpdate(true);
    setUpdateMsg(null);
    try {
      const res = await downloadDesktopUpdate();
      if (!res?.success) {
        setUpdateMsg({ type: 'error', text: res?.error || 'Failed to download update.' });
      }
    } catch (err: any) {
      setUpdateMsg({ type: 'error', text: err?.message || 'Download failed.' });
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const handleRestartAndInstall = () => {
    quitAndInstallDesktopUpdate();
  };

  const handleInstallLocalFile = async () => {
    setInstallingLocal(true);
    setUpdateMsg(null);
    try {
      const res = await installDesktopLocalUpdateFile();
      if (res?.error) {
        setUpdateMsg({ type: 'error', text: res.error });
      }
    } catch (err: any) {
      setUpdateMsg({ type: 'error', text: err?.message || 'Local install failed.' });
    } finally {
      setInstallingLocal(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setStatusMsg(null);

    try {
      const aliasesArray = userAliases
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      let keyToSave: string | null = geminiApiKey.trim() || null;
      if (llmModel.startsWith('ollama')) {
        const ep = ollamaEndpoint.trim();
        const k = ollamaApiKey.trim();
        if (ep && k) {
          keyToSave = JSON.stringify({ endpoint: ep, apiKey: k });
        } else if (ep) {
          keyToSave = ep;
        } else if (k) {
          keyToSave = k;
        } else {
          keyToSave = null;
        }
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          user_aliases: aliasesArray,
          gemini_api_key: keyToSave,
          llm_model: llmModel,
          auto_purge_enabled: autoPurgeEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setSettings(data);
      if (data.display_name !== undefined) {
        setDisplayName(data.display_name || '');
      }
      if (data.user_aliases !== undefined) {
        setUserAliases((data.user_aliases || []).join(', '));
      }
      setStatusMsg({ type: 'success', text: 'Executive settings updated successfully!' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error updating settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const isOllama = llmModel.toLowerCase().includes('ollama');
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmModel,
          apiKey: isOllama ? ollamaApiKey.trim() : geminiApiKey.trim(),
          endpoint: isOllama ? ollamaEndpoint.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || `Connected successfully (${data.latencyMs}ms)`,
          latencyMs: data.latencyMs,
        });

        // Automatically persist tested LLM model and API key so background sync immediately has it
        try {
          let keyToSave: string | null = geminiApiKey.trim() || null;
          if (llmModel.startsWith('ollama')) {
            const ep = ollamaEndpoint.trim();
            const k = ollamaApiKey.trim();
            if (ep && k) {
              keyToSave = JSON.stringify({ endpoint: ep, apiKey: k });
            } else if (ep) {
              keyToSave = ep;
            } else if (k) {
              keyToSave = k;
            } else {
              keyToSave = null;
            }
          }

          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              llm_model: llmModel,
              gemini_api_key: keyToSave,
            }),
          });
        } catch {
          // Non-blocking background save
        }
      } else {
        setTestResult({
          success: false,
          message: data.error || data.message || 'Connection test failed',
        });
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setTestResult({
        success: false,
        message: errorObj?.message || 'Network request failed',
      });
    } finally {
      setTestingAi(false);
    }
  };

  const handleTestAccount = async (accountId: string) => {
    setTestingAccountId(accountId);
    setAccountTestResults((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });

    try {
      const res = await fetch(`/api/accounts/${accountId}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setAccountTestResults((prev) => ({
        ...prev,
        [accountId]: {
          success: Boolean(data.success),
          message: data.message || (data.success ? 'Connected' : 'Connection failed'),
          imapMs: data.imap?.latencyMs,
          smtpMs: data.smtp?.latencyMs,
        },
      }));
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setAccountTestResults((prev) => ({
        ...prev,
        [accountId]: {
          success: false,
          message: errorObj?.message || 'Network error testing mailbox',
        },
      }));
    } finally {
      setTestingAccountId(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Navigation />

      <main className="w-full flex-1 min-h-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col overflow-hidden space-y-4">
        {/* Header */}
        <div className="shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">System Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure connected mailboxes, AI credentials, executive aliases, and email signatures.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 shrink-0">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'accounts'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Connected Mailboxes</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-300">
              {accounts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('signatures')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'signatures'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Email Signatures</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'ai'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI Preferences</span>
          </button>

          <button
            onClick={() => setActiveTab('updates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'updates'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>App Updates</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-indigo-300 font-mono">
              {appVersion}
            </span>
          </button>
        </div>

        {/* Notification Alert */}
        {statusMsg && (
          <div
            className={`shrink-0 p-3 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* TAB 1: CONNECTED MAILBOXES */}
        {activeTab === 'accounts' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Connected Mailboxes</h2>
                    <p className="text-xs text-slate-400">Manage connected IMAP/SMTP accounts</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsAddAccountOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect Mailbox</span>
                </button>
              </div>

              {loading ? (
                <div className="py-8 text-center text-slate-500 text-xs">Loading mailboxes...</div>
              ) : accounts.length === 0 ? (
                <div className="py-8 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-500 text-xs">
                  No email accounts connected yet. Click &quot;Connect Mailbox&quot; to begin.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-100">{acc.name}</h4>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              acc.is_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{acc.email}</p>
                        <p className="text-[11px] text-slate-500 mt-2">
                          IMAP: {acc.imap_server}:{acc.imap_port}
                        </p>
                        {acc.last_synced_at && (
                          <p className="text-[10px] text-indigo-400/90 mt-1">
                            Last synced: {new Date(acc.last_synced_at).toLocaleTimeString()}
                          </p>
                        )}

                        {accountTestResults[acc.id] && (
                          <div
                            className={`mt-2 p-2 rounded-lg text-[11px] flex items-start gap-1.5 leading-snug animate-fadeIn ${
                              accountTestResults[acc.id].success
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                            }`}
                          >
                            {accountTestResults[acc.id].success ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            )}
                            <span className="flex-1 break-words">{accountTestResults[acc.id].message}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/80">
                        <button
                          onClick={() => handleTestAccount(acc.id)}
                          disabled={testingAccountId === acc.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            testingAccountId === acc.id
                              ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 shadow-sm'
                          }`}
                          title="Test live IMAP and SMTP connections"
                        >
                          {testingAccountId === acc.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Activity className="w-3 h-3 text-indigo-400" />
                              <span>Test Mailbox</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setEditingAccount(acc)}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors py-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Settings</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: RICH HTML SIGNATURES */}
        {activeTab === 'signatures' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <RichSignatureEditor
              accounts={accounts}
              onSignatureUpdated={(updated) => {
                setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
              }}
            />
          </div>
        )}

        {/* TAB 3: AI CONFIGURATION & EXECUTIVE PREFERENCES */}
        {activeTab === 'ai' && (() => {
          const isCloudOllama =
            llmModel.startsWith('ollama/') &&
            (llmModel.includes('beam') ||
              llmModel.includes('oss') ||
              llmModel.includes('gemma') ||
              llmModel.includes('nemotron') ||
              Boolean(ollamaApiKey));

          const getProviderConfig = (model: string) => {
            const m = (model || '').toLowerCase();
            if (m.includes('ollama') || m.includes('localhost')) {
              return {
                provider: 'ollama',
                name: isCloudOllama ? 'Ollama Cloud' : 'Local Ollama',
                label: isCloudOllama
                  ? 'Ollama Cloud Endpoint (Default: https://ollama.com)'
                  : 'Local Ollama Endpoint (Default: http://localhost:11434)',
                placeholder: isCloudOllama ? 'https://ollama.com' : 'http://localhost:11434',
                link: 'https://ollama.com',
                linkText: 'Ollama Documentation',
                badgeText: isCloudOllama ? '☁️ Ollama Cloud Engine' : '100% Offline & Private',
                isSecret: false,
                hint: isCloudOllama
                  ? 'Hosted cloud model via Ollama Cloud. Fast inference with zero local GPU load.'
                  : 'Runs entirely on your local GPU. Zero data ever leaves your computer.',
              };
            }
            if (m.includes('groq') || m.includes('llama') || m.includes('gpt-oss') || m.includes('qwen')) {
              return {
                provider: 'groq',
                name: 'Groq Cloud',
                label: 'Groq API Key (starts with gsk_...)',
                placeholder: 'gsk_...',
                link: 'https://console.groq.com/keys',
                linkText: 'Get Free Key at console.groq.com',
                badgeText: 'Free & Ultra Fast (~300 tok/sec)',
                isSecret: true,
                hint: 'Groq provides 100% free tier inference with massive models (like OpenAI GPT-OSS 120B and Qwen 27B) with zero token costs.',
              };
            }
            if (m.includes('deepseek')) {
              return {
                provider: 'deepseek',
                name: 'DeepSeek',
                label: 'DeepSeek API Key (starts with sk-...)',
                placeholder: 'sk-...',
                link: 'https://platform.deepseek.com/api_keys',
                linkText: 'Get Key at platform.deepseek.com',
                badgeText: 'Ultra Cheap & Smart',
                isSecret: true,
                hint: 'DeepSeek V3 provides top-tier reasoning capabilities at a fraction of standard API prices.',
              };
            }
            // Default to Gemini
            return {
              provider: 'gemini',
              name: 'Google AI Studio',
              label: 'Gemini API Key (AIzaSy...)',
              placeholder: 'AIzaSy...',
              link: 'https://aistudio.google.com/app/apikey',
              linkText: 'Get Free Key at aistudio.google.com',
              badgeText: 'Official Google Tier',
              isSecret: true,
              hint: 'Google AI Studio free tier. Rate limits apply during peak usage.',
            };
          };

          const providerConfig = getProviderConfig(llmModel);

          return (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
                  <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Cpu className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">
                      AI Cognitive Triage &amp; Executive Identity
                    </h2>
                    <p className="text-xs text-slate-400">
                      Configure your high-performance AI engine (Groq Llama 3.3 70B, DeepSeek, Gemini, or Ollama) and executive persona aliases.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-5">
                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-fadeIn ${
                        testResult.success
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {testResult.success ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{testResult.message}</span>
                      </div>
                      {testResult.latencyMs !== undefined && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">
                          {testResult.latencyMs}ms
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Executive Display Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Vlad"
                          className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Known Aliases &amp; Nicknames (Comma Separated)
                      </label>
                      <input
                        type="text"
                        value={userAliases}
                        onChange={(e) => setUserAliases(e.target.value)}
                        placeholder="e.g. vlad, vladimir, vlady"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Used by AI to determine if team emails were addressed to you or another colleague.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          AI Cognitive Engine
                        </label>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {providerConfig.badgeText}
                        </span>
                      </div>
                      <div className="relative">
                        <Cpu className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <select
                          value={llmModel}
                          onChange={(e) => {
                            setLlmModel(e.target.value);
                            setTestResult(null);
                          }}
                          className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <optgroup label="☁️ Ollama Cloud (Free Hosted Models)">
                            <option value="ollama/gpt-oss:120b">
                              ☁️ Ollama Cloud: GPT-OSS 120B (Massive 120B Reasoning - Free)
                            </option>
                            <option value="ollama/gpt-oss:20b">
                              ☁️ Ollama Cloud: GPT-OSS 20B (Blazing Fast - Free)
                            </option>
                            <option value="ollama/gemma4:31b">
                              ☁️ Ollama Cloud: Gemma 4 31B (Google DeepMind Cloud - Free)
                            </option>
                            <option value="ollama/nemotron-3-nano:30b">
                              ☁️ Ollama Cloud: Nemotron-3 Nano 30B (NVIDIA Cloud - Free)
                            </option>
                            <option value="ollama/nemotron-3-super">
                              ☁️ Ollama Cloud: Nemotron-3 Super (NVIDIA Cloud - Free)
                            </option>
                            <option value="ollama/nemotron-3-ultra">
                              ☁️ Ollama Cloud: Nemotron-3 Ultra (NVIDIA Cloud - Free)
                            </option>
                            <option value="ollama/beam:cloud">
                              ☁️ Ollama Cloud: Beam (Free Cloud)
                            </option>
                          </optgroup>
                          <optgroup label="💻 Local Ollama (100% Offline &amp; Private)">
                            <option value="ollama/llama3.2">
                              💻 Local Ollama: Llama 3.2 3B (Offline GPU - 100% Private - Recommended)
                            </option>
                            <option value="ollama/llama3.1:8b">
                              💻 Local Ollama: Llama 3.1 8B (Deep Local Reasoning - 100% Private)
                            </option>
                            <option value="ollama/llama3.1">
                              💻 Local Ollama: Auto-Select Active Local Model
                            </option>
                          </optgroup>
                          <optgroup label="⚡ Groq Cloud (Free Ultra-Fast)">
                            <option value="groq/llama-3.3-70b-versatile">
                              ⚡ Groq: Llama 3.3 70B (Cloud - Free &amp; Blazing Fast)
                            </option>
                            <option value="groq/openai/gpt-oss-120b">
                              ⚡ Groq: GPT-OSS 120B (Cloud - Free &amp; Smart)
                            </option>
                            <option value="groq/openai/gpt-oss-20b">
                              ⚡ Groq: GPT-OSS 20B (Cloud - Free)
                            </option>
                          </optgroup>
                          <optgroup label="🌐 Commercial Cloud Providers">
                            <option value="deepseek/deepseek-chat">
                              🧠 DeepSeek: V3 / R1 (Cloud - Ultra Cheap)
                            </option>
                            <option value="gemini/gemini-2.0-flash">
                              Google AI Studio: Gemini 2.0 Flash (Cloud - Free Tier)
                            </option>
                          </optgroup>
                        </select>
                      </div>

                      {providerConfig.provider === 'ollama' &&
                        (isCloudOllama ? (
                          <div className="mt-2">
                            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>☁️ Ollama Cloud Engine — Authenticating via https://ollama.com</span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2">
                            {ollamaStatus.loading ? (
                              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 shrink-0" />
                                <span>Checking Ollama connection on localhost:11434...</span>
                              </div>
                            ) : ollamaStatus.online ? (
                              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                <span>
                                  🟢 Local Ollama Active on localhost:11434 {ollamaStatus.models.length > 0 && `(Installed: ${ollamaStatus.models.join(', ')})`}
                                </span>
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                <span>⚠️ Local Ollama not detected on localhost:11434 — start with &apos;ollama serve&apos;</span>
                              </div>
                            )}
                          </div>
                        ))}

                      <p className="text-[11px] text-slate-500 mt-1">
                        {providerConfig.hint}
                      </p>
                    </div>

                    {providerConfig.provider === 'ollama' ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                              Ollama API Key / Bearer Token
                            </label>
                            <a
                              href="https://ollama.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              <span>Ollama Cloud Models</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="relative">
                            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                              type="password"
                              value={ollamaApiKey}
                              onChange={(e) => {
                                setOllamaApiKey(e.target.value);
                                setTestResult(null);
                              }}
                              placeholder="Optional (enter key if using Ollama Cloud / Beam / remote auth)"
                              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Used for Ollama Cloud models (Beam, GPT-OSS 120B, etc.). Leave blank if running 100% locally on localhost.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Ollama Endpoint / Base URL (Optional)
                          </label>
                          <div className="relative">
                            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                              type="text"
                              value={ollamaEndpoint}
                              onChange={(e) => {
                                setOllamaEndpoint(e.target.value);
                                setTestResult(null);
                              }}
                              placeholder={
                                isCloudOllama
                                  ? 'https://ollama.com (Default for cloud models)'
                                  : 'http://localhost:11434 (leave blank for local, or enter cloud endpoint)'
                              }
                              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Defaults to http://localhost:11434 for local GPU, or your remote Ollama Cloud URL.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {providerConfig.label}
                          </label>
                          <a
                            href={providerConfig.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            <span>{providerConfig.linkText}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="relative">
                          <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type={providerConfig.isSecret ? 'password' : 'text'}
                            value={geminiApiKey}
                            onChange={(e) => {
                              setGeminiApiKey(e.target.value);
                              setTestResult(null);
                            }}
                            placeholder={providerConfig.placeholder}
                            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Saved securely to user preferences for AI classification and executive draft synthesis.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoPurgeEnabled}
                        onChange={(e) => setAutoPurgeEnabled(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                      />
                      <span>
                        Enable AI Auto-Purge of corporate newsletters, receipts, and closure pleasantries into Purge Log.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleTestAiConnection}
                      disabled={testingAi || savingSettings}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
                    >
                      {testingAi ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          <span>Testing Agent &amp; Key...</span>
                        </>
                      ) : (
                        <>
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Test AI Connection</span>
                        </>
                      )}
                    </button>

                    <button
                      type="submit"
                      disabled={savingSettings || testingAi}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
                    >
                      {savingSettings ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Configuration</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          );
        })()}

        {/* TAB 4: APP UPDATES */}
        {activeTab === 'updates' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-6">
            {/* Section 1: Update Check & 1-Click Install */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Software Updates</h2>
                    <p className="text-xs text-slate-400">Keep your Personal Assistant application up to date</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
                    Current Version: <strong className="text-indigo-400">{appVersion}</strong>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium border ${
                      isDesktop
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isDesktop ? 'Desktop App' : 'Browser Mode'}
                  </span>
                </div>
              </div>

              {/* Status Display Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Update Status
                  </span>
                  {updaterState.status === 'downloaded' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium">
                      Ready to install
                    </span>
                  )}
                </div>

                {updaterState.status === 'checking' && (
                  <div className="flex items-center gap-2 text-xs text-slate-300 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Checking for updates from configured release source...</span>
                  </div>
                )}

                {updaterState.status === 'available' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>
                          New version <strong>{updaterState.info?.version || 'available'}</strong> is ready to download!
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadUpdate}
                        disabled={downloadingUpdate}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {downloadingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        <span>Download Update</span>
                      </button>
                    </div>
                  </div>
                )}

                {updaterState.status === 'downloading' && (
                  <div className="space-y-2 py-1">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Downloading update package...</span>
                      <span className="font-mono text-indigo-400">
                        {updaterState.progress?.percent || 0}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${updaterState.progress?.percent || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {updaterState.status === 'downloaded' && (
                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Update package downloaded successfully. Restart the application to finish installing.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestartAndInstall}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
                    >
                      Restart & Install Now
                    </button>
                  </div>
                )}

                {updaterState.status === 'not-available' && (
                  <div className="flex items-center gap-2 text-xs text-slate-300 py-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Personal Assistant is up to date (running version {appVersion}).</span>
                  </div>
                )}

                {updaterState.status === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 py-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{updaterState.error || 'Failed to check for updates'}</span>
                  </div>
                )}

                {updaterState.status === 'idle' && (
                  <div className="text-xs text-slate-400 py-1">
                    Ready to check for updates or install a downloaded setup file.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={checkingUpdate || !isDesktop}
                  className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {checkingUpdate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Checking Online...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Check for Updates Online</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleInstallLocalFile}
                  disabled={installingLocal || !isDesktop}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  title="Pick a downloaded setup installer and upgrade in place"
                >
                  {installingLocal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Launching Installer...</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4 text-indigo-400" />
                      <span>Install Update from Local .exe File...</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Tip: If you receive a compiled <code className="text-slate-400 font-mono">Personal Assistant Setup *.exe</code> file directly, use the <strong>Install Update from Local .exe File</strong> option. The app will cleanly close its background server and upgrade itself in place.
              </p>
            </section>
          </div>
        )}
      </main>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onAccountAdded={(newAcc) => {
          setAccounts((prev) => [...prev, newAcc]);
        }}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        account={editingAccount}
        isOpen={Boolean(editingAccount)}
        onClose={() => setEditingAccount(null)}
        onAccountUpdated={(updated) => {
          setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }}
        onAccountDeleted={(deletedId) => {
          setAccounts((prev) => prev.filter((a) => a.id !== deletedId));
        }}
      />
    </div>
  );
}
