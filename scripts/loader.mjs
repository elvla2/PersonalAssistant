import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  let targetSpecifier = specifier;

  if (targetSpecifier.startsWith('@/')) {
    const relPath = targetSpecifier.replace(/^@\//, 'src/');
    targetSpecifier = pathToFileURL(path.resolve(process.cwd(), relPath)).href;
  }

  try {
    return await nextResolve(targetSpecifier, context);
  } catch (err) {
    if (
      err.code === 'ERR_MODULE_NOT_FOUND' ||
      err.code === 'ERR_UNSUPPORTED_DIR_IMPORT'
    ) {
      for (const ext of ['.ts', '.tsx', '.js', '/route.ts', '/index.ts', '/index.js']) {
        try {
          return await nextResolve(targetSpecifier + ext, context);
        } catch {
          // try next extension
        }
      }
    }
    throw err;
  }
}
