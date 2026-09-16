/**
 * Compares hook payloads captured from a real Claude Code session against the
 * fields rulekeep actually reads (docs/05-testing.md "Layer 2: hook contract
 * tests", docs/04-build-plan.md M3 step 8).
 *
 * Every other layer of the test suite is built on an assumption about what
 * Claude Code sends. This script is how that assumption gets checked against
 * reality: point it at a RULEKEEP_RECORD directory and it reports which
 * expected fields were present, which were missing, and what arrived that we
 * do not read yet.
 *
 *   RULEKEEP_RECORD=./captures claude --plugin-dir ./plugins/claude-code
 *   node scripts/check-captures.mjs ./captures
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What src/adapters/claude-code.ts and src/cli/hookClaudeCode.ts read.
 * `required` must be present or the hook cannot work at all; `expected` is
 * used when present but has a defined fallback.
 */
const CONTRACT = {
  'session-start': {
    required: ['session_id', 'cwd', 'hook_event_name'],
    expected: ['source'],
  },
  'pre-tool-use': {
    required: ['session_id', 'cwd', 'hook_event_name', 'tool_name'],
    // tool_input.command for shell tools; tool_input.file_path + tool_use_id for edits.
    expected: ['tool_input', 'tool_use_id'],
  },
  'post-tool-use': {
    required: ['session_id', 'cwd', 'hook_event_name', 'tool_name', 'tool_input'],
    expected: ['tool_use_id'],
  },
  stop: {
    required: ['session_id', 'cwd', 'hook_event_name'],
    expected: ['stop_hook_active', 'last_assistant_message'],
  },
};

const dir = process.argv[2] ?? process.env.RULEKEEP_RECORD;
if (!dir) {
  console.error('usage: node scripts/check-captures.mjs <capture-dir>');
  console.error('   (or set RULEKEEP_RECORD to the directory used during the session)');
  process.exit(2);
}

function readCaptures(root) {
  const out = [];
  let agents;
  try {
    agents = readdirSync(root);
  } catch {
    console.error(`No captures found at ${root}.`);
    console.error('Run a real session first:');
    console.error(`  RULEKEEP_RECORD=${root} claude --plugin-dir ./plugins/claude-code`);
    process.exit(1);
  }

  for (const agent of agents) {
    const agentDir = join(root, agent);
    if (!statSync(agentDir).isDirectory()) continue;
    for (const file of readdirSync(agentDir)) {
      if (!file.endsWith('.json')) continue;
      const event = file.replace(/-\d+-[a-z0-9]+\.json$/, '');
      try {
        out.push({ event, file, payload: JSON.parse(readFileSync(join(agentDir, file), 'utf8')) });
      } catch {
        out.push({ event, file, payload: null });
      }
    }
  }
  return out;
}

const captures = readCaptures(dir);
if (captures.length === 0) {
  console.error(`${dir} exists but holds no captures yet.`);
  process.exit(1);
}

const byEvent = new Map();
for (const capture of captures) {
  if (!byEvent.has(capture.event)) byEvent.set(capture.event, []);
  byEvent.get(capture.event).push(capture);
}

console.log(`${captures.length} payload(s) captured across ${byEvent.size} event(s), from ${dir}\n`);

let problems = 0;
const contractEvents = Object.keys(CONTRACT);

for (const event of contractEvents) {
  const seen = byEvent.get(event) ?? [];
  if (seen.length === 0) {
    console.log(`${event}\n  -- not captured in this session --\n`);
    continue;
  }

  const { required, expected } = CONTRACT[event];
  const presence = new Map();
  const extras = new Set();

  for (const { payload } of seen) {
    if (payload === null) {
      problems += 1;
      continue;
    }
    for (const key of [...required, ...expected]) {
      if (payload[key] !== undefined) presence.set(key, (presence.get(key) ?? 0) + 1);
    }
    for (const key of Object.keys(payload)) {
      if (!required.includes(key) && !expected.includes(key)) extras.add(key);
    }
  }

  console.log(`${event}  (${seen.length} payload${seen.length === 1 ? '' : 's'})`);

  for (const key of required) {
    const count = presence.get(key) ?? 0;
    if (count === seen.length) {
      console.log(`  ok       ${key}`);
    } else {
      problems += 1;
      console.log(`  MISSING  ${key}  -- present in only ${count}/${seen.length}; rulekeep depends on this`);
    }
  }

  for (const key of expected) {
    const count = presence.get(key) ?? 0;
    console.log(`  ${count > 0 ? 'ok      ' : 'absent  '} ${key}${count > 0 ? '' : '  (optional; has a fallback)'}`);
  }

  if (extras.size > 0) {
    console.log(`  note     Claude Code also sent: ${[...extras].sort().join(', ')}`);
  }
  console.log();
}

const unknown = [...byEvent.keys()].filter((event) => !contractEvents.includes(event));
if (unknown.length > 0) {
  console.log(`Captured events rulekeep does not handle: ${unknown.join(', ')}\n`);
}

if (problems > 0) {
  console.log(`${problems} problem(s). The contract tests do not match what Claude Code actually sends.`);
  console.log('Fix src/adapters/claude-code.ts and test/contracts/claudeCodeHooks.test.ts to match the captures.');
  process.exit(1);
}

console.log('Every field rulekeep depends on was present in every captured payload.');
console.log('The contract tests match reality for the events exercised this session.');
