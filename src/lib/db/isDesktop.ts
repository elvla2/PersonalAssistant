/**
 * Helper to determine if the application is operating in Desktop Mode (100% Local SQLite).
 */
export function isDesktopMode(): boolean {
  // 1. Explicit environment variable set by electron/main.js or npm run electron:dev
  if (
    process.env.DESKTOP_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DESKTOP_MODE === 'true'
  ) {
    return true;
  }

  // 2. Client-side Electron bridge check in renderer window
  if (typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron)) {
    return true;
  }

  // 3. Client-side cookie check for local desktop sessions
  if (typeof document !== 'undefined') {
    if (
      document.cookie.includes('pa_session_token=') ||
      document.cookie.includes('x-desktop-mode=true')
    ) {
      return true;
    }
  }

  // 4. Fallback check if LOCAL_DB_DIR is explicitly configured
  if (typeof process !== 'undefined' && Boolean(process.env.LOCAL_DB_DIR)) {
    return true;
  }

  return false;
}
