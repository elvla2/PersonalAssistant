import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const standaloneDir = path.join(rootDir, '.next', 'standalone');
const serverJs = path.join(standaloneDir, 'server.js');
const nextStaticSrc = path.join(rootDir, '.next', 'static');
const nextStaticDest = path.join(standaloneDir, '.next', 'static');
const nextServerSrc = path.join(rootDir, '.next', 'server');
const nextServerDest = path.join(standaloneDir, '.next', 'server');
const publicSrc = path.join(rootDir, 'public');
const publicDest = path.join(standaloneDir, 'public');

console.log('[prepare_standalone] Preparing standalone assets...');

if (!fs.existsSync(standaloneDir)) {
  console.error(`[prepare_standalone] ERROR: Standalone directory not found at: ${standaloneDir}`);
  console.error('[prepare_standalone] Please run "next build" with output: "standalone" first.');
  process.exit(1);
}

if (!fs.existsSync(serverJs)) {
  console.error(`[prepare_standalone] ERROR: Standalone server.js not found at: ${serverJs}`);
  process.exit(1);
}

function safeCopySync(src, dest) {
  try {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
  } catch (err) {
    try {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const sPath = path.join(src, entry.name);
        const dPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          safeCopySync(sPath, dPath);
        } else {
          try {
            fs.copyFileSync(sPath, dPath);
          } catch (fileErr) {
            // ignore if already identical or locked
          }
        }
      }
    } catch (fallbackErr) {
      console.warn(`[prepare_standalone] Fallback copy notice for ${dest}: ${fallbackErr.message}`);
    }
  }
}

// Copy .next/static into .next/standalone/.next/static
if (fs.existsSync(nextStaticSrc)) {
  console.log(`[prepare_standalone] Copying .next/static -> ${nextStaticDest}`);
  safeCopySync(nextStaticSrc, nextStaticDest);
  console.log('[prepare_standalone] Static assets copied successfully.');
} else {
  console.warn('[prepare_standalone] WARNING: .next/static does not exist. Skipping static copy.');
}

// Copy .next/server into .next/standalone/.next/server to ensure all chunks and manifests are present
if (fs.existsSync(nextServerSrc)) {
  console.log(`[prepare_standalone] Merging .next/server -> ${nextServerDest}`);
  safeCopySync(nextServerSrc, nextServerDest);
  console.log('[prepare_standalone] Server chunks and manifests synced.');
}

// Copy public into .next/standalone/public if public exists
if (fs.existsSync(publicSrc)) {
  console.log(`[prepare_standalone] Copying public -> ${publicDest}`);
  safeCopySync(publicSrc, publicDest);
  console.log('[prepare_standalone] Public assets copied successfully.');
} else {
  console.log('[prepare_standalone] No public/ directory found. Skipping public assets copy.');
}

// Copy .next/standalone/node_modules into .next/standalone/server_modules
// This prevents electron-builder from stripping node_modules during packaging
const nodeModulesSrc = path.join(standaloneDir, 'node_modules');
const serverModulesDest = path.join(standaloneDir, 'server_modules');
if (fs.existsSync(nodeModulesSrc)) {
  console.log(`[prepare_standalone] Copying node_modules -> ${serverModulesDest} to bypass electron-builder excludes...`);
  safeCopySync(nodeModulesSrc, serverModulesDest);
  console.log('[prepare_standalone] Server modules copied successfully.');
} else {
  console.warn('[prepare_standalone] WARNING: .next/standalone/node_modules not found!');
}

// Also merge any missing runtime packages from root node_modules into server_modules
// (Next.js standalone tracing omits sub-dependencies of serverExternalPackages like qrcode -> dijkstrajs)
const rootNodeModules = path.join(rootDir, 'node_modules');
if (fs.existsSync(rootNodeModules)) {
  console.log(`[prepare_standalone] Merging external dependencies from root node_modules -> ${serverModulesDest}...`);
  try {
    const entries = fs.readdirSync(rootNodeModules, { withFileTypes: true });
    let merged = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const destPath = path.join(serverModulesDest, entry.name);
      if (!fs.existsSync(destPath)) {
        const srcPath = path.join(rootNodeModules, entry.name);
        try {
          fs.cpSync(srcPath, destPath, { recursive: true });
          merged++;
        } catch {
          // ignore
        }
      }
    }
    console.log(`[prepare_standalone] Merged ${merged} external packages into server_modules.`);
  } catch (mergeErr) {
    console.warn('[prepare_standalone] Note merging root dependencies:', mergeErr.message);
  }
}

console.log('[prepare_standalone] Verification:');
console.log(` - server.js: ${fs.existsSync(serverJs) ? 'OK' : 'MISSING'}`);
console.log(` - .next/static: ${fs.existsSync(nextStaticDest) ? 'OK' : 'MISSING'}`);
console.log(` - .next/server: ${fs.existsSync(nextServerDest) ? 'OK' : 'MISSING'}`);
console.log(` - server_modules: ${fs.existsSync(serverModulesDest) ? 'OK' : 'MISSING'}`);
console.log('[prepare_standalone] Standalone bundle ready for Electron packaging!');
