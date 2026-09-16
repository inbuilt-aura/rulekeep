/**
 * Copies the built bundle into the Claude Code plugin folder
 * (docs/04-build-plan.md M3 step 6). The plugin ships its own copy because
 * an installed plugin runs from its own directory, with no npm install and
 * no node_modules of its own — ${CLAUDE_PLUGIN_ROOT}/dist/holdfast.cjs must
 * simply be there.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'dist', 'holdfast.cjs');
const targetDir = join(repoRoot, 'plugins', 'claude-code', 'dist');

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, 'holdfast.cjs'));

console.log('synced dist/holdfast.cjs -> plugins/claude-code/dist/holdfast.cjs');
