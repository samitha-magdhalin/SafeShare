import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
  console.error('The SafeShare Windows Pilot installer must be built on Windows.');
  process.exit(1);
}

const agentRoot = resolve(import.meta.dirname, '..');
const workspace = resolve(agentRoot, '..');
const inherited = process.env.RUSTFLAGS?.trim();
const remap = [
  `--remap-path-prefix=${homedir()}=<user-profile>`,
  `--remap-path-prefix=${workspace}=<workspace>`,
].join(' ');
const cli = resolve(agentRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const result = spawnSync(process.execPath, [cli, 'build'], {
  cwd: agentRoot,
  env: { ...process.env, RUSTFLAGS: inherited ? inherited + ' ' + remap : remap },
  stdio: 'inherit',
});
if (result.error) console.error('Pilot build process could not start:', result.error.message);
process.exit(result.status ?? 1);
