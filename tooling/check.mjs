import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

for (const entry of readdirSync('src', { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) {
    execFileSync(process.execPath, ['--check', resolve(entry.parentPath, entry.name)], { stdio: 'inherit' });
  }
}

execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  stdio: 'inherit',
});
