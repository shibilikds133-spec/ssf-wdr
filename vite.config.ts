import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function createBuildVersion(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const utcTimestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${utcTimestamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function stampServiceWorkerVersion(buildVersion: string): Plugin {
  let outDir = 'dist';

  return {
    name: 'stamp-sw-version',
    apply: 'build',
    configResolved(resolvedConfig) {
      outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) {
        throw new Error(`[stamp-sw-version] Missing built service worker at ${swPath}`);
      }

      const content = fs.readFileSync(swPath, 'utf8');
      if (!content.includes('__BUILD_VERSION__')) {
        throw new Error('[stamp-sw-version] Placeholder __BUILD_VERSION__ not found in dist/sw.js');
      }

      const stamped = content.replace(/__BUILD_VERSION__/g, buildVersion);
      fs.writeFileSync(swPath, stamped, 'utf8');
    },
  };
}

export default defineConfig(({ command }) => {
  const buildVersion = command === 'build' ? createBuildVersion() : 'dev';

  return {
    define: {
      'import.meta.env.VITE_APP_BUILD_VERSION': JSON.stringify(buildVersion),
    },
    plugins: [react(), stampServiceWorkerVersion(buildVersion)],
  };
});
