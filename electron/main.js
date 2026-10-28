// Enable Desktop Mode (100% Local SQLite architecture)
process.env.DESKTOP_MODE = 'true';
process.env.NEXT_PUBLIC_DESKTOP_MODE = 'true';

const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const { fork } = require('child_process');

try {
  const userDataPath = app.getPath('userData');
  process.env.LOCAL_DB_DIR = userDataPath;
} catch {
  // Handled in app.whenReady
}

// Single instance lock to avoid duplicate background processes
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let tray = null;
let serverProcess = null;
let embeddedServerUrl = null;
let serverStartPromise = null;
app.isQuitting = false;

// 16x16 icon fallback data URL (indigo dot)
const DEFAULT_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAIU6G/0h8ZAFGZGF0dTBpGHYA2fH///9P+P//P0wOXRxkBpgNZAMpMo1jGwR3AlwdxRjkgkH3AKFwwgVjDQw3w6hpAM31gawVlFw1mHYAoYwPAJ7QGq2/XbE+AAAAAElFTkSuQmCC';

const SPLASH_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Personal Assistant</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #030712;
      color: #f9fafb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #f3f4f6;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <div class="title">Starting Personal Assistant...</div>
  <div class="subtitle">Initializing local engine</div>
</body>
</html>`;

function getErrorHtml(errorMessage) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error - Personal Assistant</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background-color: #030712;
      color: #f9fafb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      box-sizing: border-box;
      text-align: center;
    }
    .title { font-size: 20px; font-weight: 700; color: #ef4444; margin-bottom: 12px; }
    .msg { font-size: 14px; color: #d1d5db; max-width: 600px; word-break: break-word; line-height: 1.5; background: #111827; padding: 16px; border-radius: 8px; border: 1px solid #374151; }
  </style>
</head>
<body>
  <div class="title">Unable to Start Local Engine</div>
  <div class="msg">${errorMessage}</div>
</body>
</html>`;
}

function getAppIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createFromDataURL(DEFAULT_ICON_DATA_URL);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : null;
      srv.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error('Failed to obtain a free port'));
        resolve(port);
      });
    });
  });
}

function waitForServer(url, timeoutMs = 25000, checkExit = null) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      if (checkExit && checkExit()) {
        return reject(checkExit());
      }

      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          scheduleRetry();
        }
      });

      req.on('error', () => {
        scheduleRetry();
      });

      req.setTimeout(1000, () => {
        req.destroy();
        scheduleRetry();
      });
    }

    function scheduleRetry() {
      if (checkExit && checkExit()) {
        return reject(checkExit());
      }
      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Timed out waiting for standalone server at ${url} after ${timeoutMs}ms`));
      } else {
        setTimeout(ping, 250);
      }
    }

    ping();
  });
}

async function startEmbeddedServer(userDataPath) {
  if (embeddedServerUrl) {
    return embeddedServerUrl;
  }

  const port = await getFreePort();
  const standaloneDir = path.join(process.resourcesPath, 'standalone');
  const serverScript = path.join(standaloneDir, 'server.js');
  const serverModules = path.join(standaloneDir, 'server_modules');
  const actualNodeModules = path.join(standaloneDir, 'node_modules');

  console.log(`[main] Launching standalone server from: ${serverScript} on port ${port}`);

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Standalone server script not found at ${serverScript}`);
  }

  // Ensure node_modules exists in standalone by creating a directory junction from server_modules if needed
  if (!fs.existsSync(actualNodeModules) && fs.existsSync(serverModules)) {
    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      console.log(`[main] Creating symlink (${symlinkType}): ${actualNodeModules} -> ${serverModules}`);
      fs.symlinkSync(serverModules, actualNodeModules, symlinkType);
    } catch (symErr) {
      console.warn('[main] Junction creation note:', symErr?.message);
    }
  }

  const nodePathEntries = [
    actualNodeModules,
    serverModules,
    process.env.NODE_PATH || '',
  ].filter(Boolean).join(path.delimiter);

  let serverError = null;
  let stderrBuffer = '';

  serverProcess = fork(serverScript, [], {
    cwd: standaloneDir,
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_PATH: nodePathEntries,
      DESKTOP_MODE: 'true',
      NEXT_PUBLIC_DESKTOP_MODE: 'true',
      LOCAL_DB_DIR: userDataPath,
    },
    stdio: 'pipe',
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      console.log(`[standalone-server] ${data.toString().trim()}`);
    });
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      console.error(`[standalone-server:err] ${text.trim()}`);
    });
  }
  serverProcess.on('exit', (code, signal) => {
    console.log(`[standalone-server] Exited with code ${code}, signal ${signal}`);
    if (code !== 0 && code !== null) {
      const errDetails = stderrBuffer.trim() || `Exit code ${code}, signal ${signal}`;
      serverError = new Error(`Standalone server stopped unexpectedly.\n\n${errDetails}`);
    }
    serverProcess = null;
    embeddedServerUrl = null;
    serverStartPromise = null;
  });

  const targetUrl = `http://127.0.0.1:${port}`;
  await waitForServer(targetUrl, 25000, () => serverError);
  embeddedServerUrl = targetUrl;
  return targetUrl;
}

function getOrStartEmbeddedServer(userDataPath) {
  if (embeddedServerUrl) return Promise.resolve(embeddedServerUrl);
  if (serverStartPromise) return serverStartPromise;

  serverStartPromise = startEmbeddedServer(userDataPath).catch((err) => {
    serverStartPromise = null;
    throw err;
  });

  return serverStartPromise;
}

function stopEmbeddedServer() {
  if (serverProcess) {
    try {
      console.log('[main] Terminating embedded server process...');
      serverProcess.kill();
    } catch (err) {
      console.error('[main] Error terminating server process:', err);
    }
    serverProcess = null;
    embeddedServerUrl = null;
    serverStartPromise = null;
  }
}

function createWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const icon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030712',
    title: 'Personal Assistant',
    icon: icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const isPackaged = app.isPackaged;
  const appUrl = process.env.APP_URL;

  if (isPackaged && !appUrl) {
    // Packaged production mode: show loading splash while embedded server initializes
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML));

    const dbDir = process.env.LOCAL_DB_DIR || app.getPath('userData');
    getOrStartEmbeddedServer(dbDir)
      .then((serverUrl) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(serverUrl, {
            extraHeaders: 'x-desktop-mode: true\n',
          });
        }
      })
      .catch((err) => {
        console.error('[main] Failed to start standalone server:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getErrorHtml(err.message)));
        }
      });
  } else {
    // Development mode or custom APP_URL override
    const targetUrl = appUrl || 'http://localhost:3000';
    mainWindow.loadURL(targetUrl, {
      extraHeaders: 'x-desktop-mode: true\n',
    });
  }

  // Intercept close to minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createTray() {
  if (tray) return;

  const icon = getAppIcon();
  tray = new Tray(icon);
  tray.setToolTip('Personal Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Personal Assistant',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Check for Updates...',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[updater] Tray check for updates error:', err?.message || err);
        });
      },
    },
    {
      label: 'Toggle DevTools',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        stopEmbeddedServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) {
      createWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// IPC Handlers
ipcMain.on('notify', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Personal Assistant',
      body: body || '',
      icon: getAppIcon(),
    }).show();
  }
});

ipcMain.on('badge', (_event, count) => {
  const numericCount = Number(count) || 0;
  if (typeof app.setBadgeCount === 'function') {
    app.setBadgeCount(numericCount);
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(numericCount > 0 ? String(numericCount) : '');
  }
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

// --- Software Auto-Updater Support (electron-updater) ---
function getUpdateConfigPath() {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'update-config.json');
  } catch {
    return path.join(process.cwd(), 'update-config.json');
  }
}

function readUpdateConfig() {
  try {
    const cfgPath = getUpdateConfigPath();
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[updater] Failed to read update-config.json:', e);
  }
  return {
    provider: 'github',
    githubRepo: process.env.GITHUB_UPDATE_REPO || 'elvla2/PersonalAssistant',
    updateUrl: process.env.UPDATE_FEED_URL || '',
    autoCheck: true,
  };
}

function writeUpdateConfig(cfg) {
  try {
    const cfgPath = getUpdateConfigPath();
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[updater] Failed to write update-config.json:', e);
    return false;
  }
}

let updaterState = {
  status: 'idle',
  info: null,
  progress: null,
  error: null,
};

function broadcastUpdaterStatus(state) {
  updaterState = { ...updaterState, ...state };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', updaterState);
  }
}

function configureAutoUpdater() {
  try {
    const cfg = readUpdateConfig();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    if (cfg.provider === 'github' && cfg.githubRepo && cfg.githubRepo.includes('/')) {
      const parts = cfg.githubRepo.split('/');
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: parts[0].trim(),
        repo: parts[1].trim(),
      });
    } else if (cfg.provider === 'generic' && cfg.updateUrl) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: cfg.updateUrl.trim(),
      });
    }
  } catch (err) {
    console.warn('[updater] configureAutoUpdater error:', err?.message || err);
  }
}

autoUpdater.on('checking-for-update', () => {
  broadcastUpdaterStatus({ status: 'checking', error: null });
});

autoUpdater.on('update-available', (info) => {
  broadcastUpdaterStatus({ status: 'available', info, error: null });
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Personal Assistant Update Available',
        body: `Version v${info?.version || ''} is available. Click to download.`,
      }).show();
    }
  } catch {}
});

autoUpdater.on('update-not-available', (info) => {
  broadcastUpdaterStatus({ status: 'not-available', info, error: null });
});

autoUpdater.on('download-progress', (progressObj) => {
  broadcastUpdaterStatus({
    status: 'downloading',
    progress: {
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    },
  });
});

autoUpdater.on('update-downloaded', (info) => {
  broadcastUpdaterStatus({ status: 'downloaded', info });
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Update Downloaded',
        body: `Version v${info?.version || ''} has been downloaded. Restart to apply update.`,
      }).show();
    }
  } catch {}
});

autoUpdater.on('error', (err) => {
  broadcastUpdaterStatus({ status: 'error', error: err?.message || String(err) });
});

ipcMain.handle('updater-get-status', () => {
  return {
    currentVersion: app.getVersion(),
    state: updaterState,
    config: readUpdateConfig(),
  };
});

ipcMain.handle('updater-save-config', (_event, cfg) => {
  const success = writeUpdateConfig(cfg);
  if (success) {
    configureAutoUpdater();
  }
  return { success, config: readUpdateConfig() };
});

ipcMain.handle('updater-check', async () => {
  try {
    configureAutoUpdater();
    broadcastUpdaterStatus({ status: 'checking', error: null });
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    broadcastUpdaterStatus({ status: 'error', error: errorMsg });
    return { success: false, error: errorMsg };
  }
});

let downloadedMacDmgPath = null;

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects while downloading update'));
      }
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.get(
        currentUrl,
        { headers: { 'User-Agent': 'PersonalAssistant-Updater/1.0' } },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return request(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Cannot download "${currentUrl}", status ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferred = 0;
          const startTime = Date.now();
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            transferred += chunk.length;
            if (totalBytes > 0 && onProgress) {
              const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
              onProgress({
                percent: Math.min(100, Math.round((transferred / totalBytes) * 100)),
                bytesPerSecond: Math.round(transferred / elapsedSec),
                transferred,
                total: totalBytes,
              });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => resolve(destPath));
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

ipcMain.handle('updater-download', async () => {
  try {
    broadcastUpdaterStatus({ status: 'downloading', error: null });

    if (process.platform === 'darwin') {
      // On unsigned macOS builds, download the architecture-matched .dmg directly from GitHub Release
      const cfg = readUpdateConfig();
      const version = updaterState.info?.version || app.getVersion();
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const dmgFileName = `Personal-Assistant-${version}-${arch}.dmg`;
      const downloadsDir = app.getPath('downloads');
      const destPath = path.join(downloadsDir, dmgFileName);

      let downloadUrl = '';
      if (cfg.provider === 'github' && cfg.githubRepo && cfg.githubRepo.includes('/')) {
        downloadUrl = `https://github.com/${cfg.githubRepo.trim()}/releases/download/v${version}/${dmgFileName}`;
      } else if (cfg.updateUrl) {
        downloadUrl = `${cfg.updateUrl.replace(/\/$/, '')}/${dmgFileName}`;
      } else {
        downloadUrl = `https://github.com/elvla2/PersonalAssistant/releases/download/v${version}/${dmgFileName}`;
      }

      downloadedMacDmgPath = await downloadFileWithProgress(downloadUrl, destPath, (progress) => {
        broadcastUpdaterStatus({ status: 'downloading', progress });
      });

      broadcastUpdaterStatus({ status: 'downloaded', info: updaterState.info });
      return { success: true, filePath: downloadedMacDmgPath };
    }

    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    broadcastUpdaterStatus({ status: 'error', error: errorMsg });
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('updater-quit-and-install', async () => {
  if (process.platform === 'darwin' && downloadedMacDmgPath && fs.existsSync(downloadedMacDmgPath)) {
    await shell.openPath(downloadedMacDmgPath);
    app.isQuitting = true;
    stopEmbeddedServer();
    setTimeout(() => {
      app.quit();
    }, 500);
    return;
  }
  app.isQuitting = true;
  stopEmbeddedServer();
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('updater-install-local-file', async () => {
  if (!mainWindow) return { success: false, error: 'No main window' };

  const isMac = process.platform === 'darwin';
  const filterList = isMac
    ? [
        { name: 'macOS Installer Package / Disk Image', extensions: ['dmg', 'pkg', 'zip', 'app'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    : [
        { name: 'Windows Setup Installer', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ];

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: isMac
      ? 'Select Personal Assistant Installer (.dmg, .pkg, .app)'
      : 'Select Personal Assistant Setup Installer (.exe)',
    filters: filterList,
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) {
    return { canceled: true };
  }

  const installerPath = filePaths[0];
  try {
    if (isMac) {
      // On macOS, open the DMG/PKG/App using system shell handler
      await shell.openPath(installerPath);

      app.isQuitting = true;
      stopEmbeddedServer();
      setTimeout(() => {
        app.quit();
      }, 500);

      return { success: true, installerPath };
    }

    // Windows (.exe) installer
    const { spawn } = require('child_process');
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    app.isQuitting = true;
    stopEmbeddedServer();
    setTimeout(() => {
      app.quit();
    }, 500);

    return { success: true, installerPath };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to launch installer' };
  }
});

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!process.env.LOCAL_DB_DIR) {
      process.env.LOCAL_DB_DIR = app.getPath('userData');
    }
    createWindow();
    createTray();
    configureAutoUpdater();

    setTimeout(() => {
      try {
        const cfg = readUpdateConfig();
        if (cfg.autoCheck !== false) {
          console.log('[updater] Automatically checking for updates on application launch...');
          autoUpdater.checkForUpdates().catch((err) => {
            console.warn('[updater] Startup update check failed:', err?.message || err);
          });
        }
      } catch (err) {
        console.warn('[updater] Startup update check exception:', err?.message || err);
      }
    }, 3500);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    stopEmbeddedServer();
  });

  app.on('will-quit', () => {
    stopEmbeddedServer();
  });

  app.on('window-all-closed', () => {
    // Keep process alive in system tray across all platforms unless explicitly quit
    if (process.platform === 'darwin') {
      // macOS dock remains active
    }
  });
}
