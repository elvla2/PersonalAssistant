export interface UpdateConfig {
  provider: 'github' | 'generic';
  githubRepo?: string;
  updateUrl?: string;
  autoCheck?: boolean;
}

export interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: any;
  progress?: {
    percent: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
  };
  error?: string | null;
}

export interface UpdaterStatusPayload {
  currentVersion: string;
  state: UpdaterState;
  config: UpdateConfig;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  notify: (title: string, body?: string) => void;
  setBadge: (count: number) => void;
  getVersion: () => Promise<string>;
  openExternal?: (url: string) => void;
  getUpdateStatus?: () => Promise<UpdaterStatusPayload>;
  saveUpdateConfig?: (cfg: UpdateConfig) => Promise<{ success: boolean; config: UpdateConfig }>;
  checkForUpdates?: () => Promise<{ success: boolean; error?: string; result?: any }>;
  downloadUpdate?: () => Promise<{ success: boolean; error?: string }>;
  quitAndInstallUpdate?: () => void;
  installLocalUpdateFile?: () => Promise<{
    success?: boolean;
    canceled?: boolean;
    error?: string;
    installerPath?: string;
  }>;
  onUpdateStatusChange?: (callback: (data: UpdaterState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Checks if the current environment is running inside the Electron desktop shell.
 */
export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
}

/**
 * Dispatches a desktop notification.
 * Uses native Electron notification when running in desktop app.
 * Gracefully falls back to browser Notification API or safe no-op.
 */
export async function triggerDesktopNotification(title: string, body?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  if (window.electronAPI?.isElectron) {
    window.electronAPI.notify(title, body);
    return;
  }

  // Web Browser fallback
  if ('Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      }
    } catch {
      // Graceful no-op in non-supported browser contexts
    }
  }
}

/**
 * Updates application badge count if supported by desktop environment.
 */
export function setDesktopBadge(count: number): void {
  if (typeof window === 'undefined') return;
  if (window.electronAPI?.isElectron) {
    window.electronAPI.setBadge(count);
  }
}

/**
 * Gets the desktop app version or null if in browser.
 */
export async function getDesktopVersion(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.isElectron) {
    return null;
  }
  return window.electronAPI.getVersion();
}

/**
 * Opens an external URL in the default system web browser (Chrome, Edge, Safari, etc.).
 * Falls back to window.open if running in standard browser context.
 */
export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Gets software updater status and configurations.
 */
export async function getDesktopUpdateStatus(): Promise<UpdaterStatusPayload | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.getUpdateStatus) {
    return null;
  }
  return window.electronAPI.getUpdateStatus();
}

/**
 * Saves software updater configuration.
 */
export async function saveDesktopUpdateConfig(
  cfg: UpdateConfig
): Promise<{ success: boolean; config: UpdateConfig } | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.saveUpdateConfig) {
    return null;
  }
  return window.electronAPI.saveUpdateConfig(cfg);
}

/**
 * Triggers online check for software updates.
 */
export async function checkDesktopForUpdates(): Promise<{
  success: boolean;
  error?: string;
  result?: any;
} | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.checkForUpdates) {
    return null;
  }
  return window.electronAPI.checkForUpdates();
}

/**
 * Downloads available update payload.
 */
export async function downloadDesktopUpdate(): Promise<{
  success: boolean;
  error?: string;
} | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.downloadUpdate) {
    return null;
  }
  return window.electronAPI.downloadUpdate();
}

/**
 * Quits app and executes the downloaded update.
 */
export function quitAndInstallDesktopUpdate(): void {
  if (typeof window === 'undefined' || !window.electronAPI?.quitAndInstallUpdate) {
    return;
  }
  window.electronAPI.quitAndInstallUpdate();
}

/**
 * Lets the user pick a locally compiled installer file and upgrades in place.
 */
export async function installDesktopLocalUpdateFile(): Promise<{
  success?: boolean;
  canceled?: boolean;
  error?: string;
  installerPath?: string;
} | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.installLocalUpdateFile) {
    return null;
  }
  return window.electronAPI.installLocalUpdateFile();
}

/**
 * Subscribes to updater state broadcast events.
 */
export function onDesktopUpdateStatusChange(
  callback: (data: UpdaterState) => void
): () => void {
  if (typeof window === 'undefined' || !window.electronAPI?.onUpdateStatusChange) {
    return () => {};
  }
  return window.electronAPI.onUpdateStatusChange(callback);
}

