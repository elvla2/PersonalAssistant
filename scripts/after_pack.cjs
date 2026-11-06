const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');

  console.log(`[after_pack] Running macOS bundle symlink and resource sanitizer on: ${appPath}`);

  if (!fs.existsSync(resourcesPath)) {
    console.warn(`[after_pack] WARNING: Resources path not found at: ${resourcesPath}`);
    return;
  }

  let cleanedBin = 0;
  let cleanedNestedApps = 0;
  let dereferencedSymlinks = 0;
  let removedInvalidSymlinks = 0;

  function walkResources(currentDir) {
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

      // 1. Delete any .bin directory
      if (name === '.bin' && lstat.isDirectory()) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          cleanedBin++;
        } catch (e) {
          console.warn(`[after_pack] Failed to remove .bin at ${fullPath}:`, e.message);
        }
        continue;
      }

      // 2. Delete any stray nested .app inside Resources
      if (name.endsWith('.app') && lstat.isDirectory()) {
        try {
          console.log(`[after_pack] Removing stray nested .app bundle in Resources: ${fullPath}`);
          fs.rmSync(fullPath, { recursive: true, force: true });
          cleanedNestedApps++;
        } catch (e) {
          console.warn(`[after_pack] Failed to remove nested app at ${fullPath}:`, e.message);
        }
        continue;
      }

      // 3. For any symlink in Resources:
      if (lstat.isSymbolicLink()) {
        let real = null;
        try {
          real = fs.realpathSync(fullPath);
        } catch {
          real = null;
        }

        if (real && fs.existsSync(real) && real.startsWith(resourcesPath)) {
          try {
            fs.unlinkSync(fullPath);
            fs.cpSync(real, fullPath, { recursive: true, dereference: true, force: true });
            dereferencedSymlinks++;
          } catch (derefErr) {
            try {
              fs.unlinkSync(fullPath);
              removedInvalidSymlinks++;
            } catch {}
          }
        } else {
          try {
            fs.unlinkSync(fullPath);
            removedInvalidSymlinks++;
            console.log(`[after_pack] Removed invalid symlink in Resources: ${fullPath} -> ${real || 'BROKEN'}`);
          } catch (rmErr) {
            console.warn(`[after_pack] Failed to remove invalid symlink ${fullPath}:`, rmErr.message);
          }
        }
      } else if (lstat.isDirectory()) {
        walkResources(fullPath);
      }
    }
  }

  walkResources(resourcesPath);
  console.log(`[after_pack] Resources sanitized: ${cleanedBin} .bin removed, ${cleanedNestedApps} nested apps removed, ${dereferencedSymlinks} symlinks dereferenced, ${removedInvalidSymlinks} invalid symlinks removed.`);

  // Audit remaining symlinks across all of appPath
  let validCount = 0;
  let removedCount = 0;

  function auditAll(currentDir) {
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

      if (lstat.isSymbolicLink()) {
        try {
          const target = fs.readlinkSync(fullPath);
          const resolved = path.resolve(path.dirname(fullPath), target);
          if (fs.existsSync(resolved)) {
            validCount++;
          } else {
            console.warn(`[after_pack] Removing broken symlink in bundle: ${fullPath} -> ${target}`);
            fs.unlinkSync(fullPath);
            removedCount++;
          }
        } catch (auditErr) {
          try {
            fs.unlinkSync(fullPath);
            removedCount++;
          } catch {}
        }
      } else if (lstat.isDirectory()) {
        auditAll(fullPath);
      }
    }
  }

  auditAll(appPath);
  console.log(`[after_pack] Bundle symlink audit complete: ${validCount} valid framework symlinks, ${removedCount} invalid symlinks removed.`);
};
