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
    fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
  } catch (err) {
    try {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.bin') continue;
        const sPath = path.join(src, entry.name);
        const dPath = path.join(dest, entry.name);
        if (entry.isSymbolicLink()) {
          try {
            const real = fs.realpathSync(sPath);
            if (fs.existsSync(real)) {
              const stat = fs.statSync(real);
              if (stat.isDirectory()) {
                safeCopySync(real, dPath);
              } else {
                fs.copyFileSync(real, dPath);
              }
            }
          } catch {
            // ignore broken symlink in source
          }
        } else if (entry.isDirectory()) {
          safeCopySync(sPath, dPath);
        } else {
          try {
            fs.copyFileSync(sPath, dPath);
          } catch {
            // ignore
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
  console.log(`[prepare_standalone] Copying node_modules -> ${serverModulesDest} (dereference: true)...`);
  safeCopySync(nodeModulesSrc, serverModulesDest);
  console.log('[prepare_standalone] Server modules copied successfully.');
  console.log('[prepare_standalone] Removing raw .next/standalone/node_modules to avoid bundle duplicate/symlink bloat...');
  try {
    fs.rmSync(nodeModulesSrc, { recursive: true, force: true });
    console.log('[prepare_standalone] Cleaned .next/standalone/node_modules.');
  } catch (rmErr) {
    console.warn('[prepare_standalone] Warning removing node_modules:', rmErr.message);
  }
} else {
  console.warn('[prepare_standalone] WARNING: .next/standalone/node_modules not found!');
}

// Transitive Runtime Dependency Resolver
const rootNodeModules = path.join(rootDir, 'node_modules');
const DEV_BLOCKLIST = new Set([
  'electron',
  'electron-builder',
  'app-builder-lib',
  'app-builder-bin',
  'dmg-builder',
  'builder-util',
  'builder-util-runtime',
  '@electron/osx-sign',
  '@electron/notarize',
  '@electron/rebuild',
  '@electron/fuses',
  '@electron/asar',
  'typescript',
  'eslint',
  'eslint-config-next',
  'concurrently',
  'wait-on',
  'cross-env',
]);

if (fs.existsSync(rootNodeModules)) {
  console.log(`[prepare_standalone] Resolving transitive runtime dependencies for ${serverModulesDest}...`);

  // Read root package.json dependencies
  const rootPkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const prodDeps = rootPkgJson.dependencies || {};

  // Collect initial seeded packages already present in serverModulesDest
  const seededPackages = new Set();
  if (fs.existsSync(serverModulesDest)) {
    for (const top of fs.readdirSync(serverModulesDest, { withFileTypes: true })) {
      if (top.name.startsWith('.')) continue;
      if (top.name.startsWith('@') && top.isDirectory()) {
        const scopeDir = path.join(serverModulesDest, top.name);
        for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          if (sub.isDirectory()) seededPackages.add(`${top.name}/${sub.name}`);
        }
      } else if (top.isDirectory()) {
        seededPackages.add(top.name);
      }
    }
  }

  const queue = [];
  const visited = new Set(seededPackages);

  for (const dep of Object.keys(prodDeps)) {
    if (dep === 'electron-updater') continue; // Lives in app.asar for desktop updater
    if (DEV_BLOCKLIST.has(dep) || dep.startsWith('@types/')) continue;
    if (!visited.has(dep)) {
      visited.add(dep);
      queue.push(dep);
    }
  }

  // Also queue seeded packages so their untraced sub-dependencies are resolved
  for (const seeded of seededPackages) {
    if (!DEV_BLOCKLIST.has(seeded) && !seeded.startsWith('@types/')) {
      queue.push(seeded);
    }
  }

  let mergedCount = 0;

  while (queue.length > 0) {
    const pkgName = queue.shift();
    if (DEV_BLOCKLIST.has(pkgName) || pkgName.startsWith('@types/')) continue;

    const destPath = path.join(serverModulesDest, ...pkgName.split('/'));
    const srcPath = path.join(rootNodeModules, ...pkgName.split('/'));

    if (!fs.existsSync(destPath) && fs.existsSync(srcPath)) {
      try {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.cpSync(srcPath, destPath, { recursive: true, dereference: true, force: true });
        mergedCount++;
        // Delete .bin inside package if present
        const binInPkg = path.join(destPath, '.bin');
        if (fs.existsSync(binInPkg)) {
          fs.rmSync(binInPkg, { recursive: true, force: true });
        }
      } catch (cpErr) {
        console.warn(`[prepare_standalone] Warning copying ${pkgName}:`, cpErr.message);
      }
    }

    // Inspect package.json to queue dependencies and optionalDependencies
    const pkgJsonPath = fs.existsSync(path.join(destPath, 'package.json'))
      ? path.join(destPath, 'package.json')
      : path.join(srcPath, 'package.json');

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const subDeps = { ...(raw.dependencies || {}), ...(raw.optionalDependencies || {}) };
        for (const subDep of Object.keys(subDeps)) {
          if (!visited.has(subDep) && !DEV_BLOCKLIST.has(subDep) && !subDep.startsWith('@types/')) {
            visited.add(subDep);
            queue.push(subDep);
          }
        }
      } catch {
        // ignore parse error
      }
    }
  }

  console.log(`[prepare_standalone] Transitive dependency resolution complete: merged ${mergedCount} runtime packages into server_modules.`);
}

// Final Standalone Sanitizer: eliminate .bin dirs and dereference/delete all symlinks
function sanitizeStandaloneTree(dir) {
  console.log(`[prepare_standalone] Sanitizing standalone directory: ${dir}...`);
  let dereferenced = 0;
  let removedBroken = 0;

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: false });
    for (const name of entries) {
      const fullPath = path.join(currentDir, name);
      let lstat;
      try {
        lstat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }

      if (name === '.bin' && lstat.isDirectory()) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch {}
        continue;
      }

      if (lstat.isSymbolicLink()) {
        try {
          const real = fs.realpathSync(fullPath);
          if (fs.existsSync(real) && real.startsWith(rootDir)) {
            fs.unlinkSync(fullPath);
            fs.cpSync(real, fullPath, { recursive: true, dereference: true, force: true });
            dereferenced++;
            // If the dereferenced target is a directory, inspect its children
            try {
              if (fs.lstatSync(fullPath).isDirectory()) {
                walk(fullPath);
              }
            } catch {}
          } else {
            fs.unlinkSync(fullPath);
            removedBroken++;
          }
        } catch {
          try {
            fs.unlinkSync(fullPath);
            removedBroken++;
          } catch {}
        }
      } else if (lstat.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(dir);

  // Strict verification audit
  let symlinksRemaining = 0;
  function audit(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: false });
    for (const name of entries) {
      const fullPath = path.join(currentDir, name);
      try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
          symlinksRemaining++;
          console.warn(`[prepare_standalone] Remaining symlink found: ${fullPath}`);
        } else if (lstat.isDirectory()) {
          audit(fullPath);
        }
      } catch {}
    }
  }

  audit(dir);
  console.log(`[prepare_standalone] Sanitization summary: ${dereferenced} dereferenced, ${removedBroken} broken removed, ${symlinksRemaining} symbolic links remaining.`);
  if (symlinksRemaining === 0) {
    console.log('[prepare_standalone] Verification: 0 symbolic links remain in standalone bundle.');
  } else {
    console.error(`[prepare_standalone] ERROR: ${symlinksRemaining} symbolic links still detected in standalone directory!`);
    process.exit(1);
  }
}

sanitizeStandaloneTree(standaloneDir);

console.log('[prepare_standalone] Verification:');
console.log(` - server.js: ${fs.existsSync(serverJs) ? 'OK' : 'MISSING'}`);
console.log(` - .next/static: ${fs.existsSync(nextStaticDest) ? 'OK' : 'MISSING'}`);
console.log(` - .next/server: ${fs.existsSync(nextServerDest) ? 'OK' : 'MISSING'}`);
console.log(` - server_modules: ${fs.existsSync(serverModulesDest) ? 'OK' : 'MISSING'}`);
console.log('[prepare_standalone] Standalone bundle ready for Electron packaging!');
