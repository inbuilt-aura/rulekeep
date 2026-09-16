/**
 * Parses and validates holdfast.yaml (docs/02-what-we-build.md "The rules
 * file"). Never throws — every failure is a value, with a line number, so a
 * broken config fails open with a clear message instead of crashing a hook
 * (docs/03-architecture.md "Fail open").
 */
import picomatch from 'picomatch';
import { parseDocument, type Document, isMap } from 'yaml';
import type { RuleMode } from './events.js';

export const RULE_TYPES = ['command', 'line', 'boundary', 'test-guard', 'checker', 'prose'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

interface RuleCommon {
  readonly id: string;
  readonly mode: RuleMode;
  readonly allowOverride: boolean;
  readonly message: string;
  /** Compiled from `files`/`exclude`; undefined means "applies to every file". */
  readonly matchesPath?: ((path: string) => boolean) | undefined;
}

export interface CommandRule extends RuleCommon {
  readonly type: 'command';
  readonly match: RegExp;
}

export interface LineRule extends RuleCommon {
  readonly type: 'line';
  readonly added?: RegExp | undefined;
  readonly removed?: RegExp | undefined;
}

export interface BoundaryRule extends RuleCommon {
  readonly type: 'boundary';
  readonly disallow: readonly string[];
}

export const TEST_GUARD_CHECKS = ['skip-or-focus', 'file-deleted', 'assertions-removed'] as const;
export type TestGuardCheck = (typeof TEST_GUARD_CHECKS)[number];

export interface TestGuardRule extends RuleCommon {
  readonly type: 'test-guard';
  readonly checks: readonly TestGuardCheck[];
}

export interface CheckerRule extends RuleCommon {
  readonly type: 'checker';
  readonly run: string;
  readonly cwd: string;
  readonly on: 'stop' | 'edit';
  readonly timeoutSeconds: number;
  readonly when?: ((path: string) => boolean) | undefined;
}

export interface ProseRule extends RuleCommon {
  readonly type: 'prose';
  readonly match: RegExp;
}

export type Rule = CommandRule | LineRule | BoundaryRule | TestGuardRule | CheckerRule | ProseRule;

export interface Config {
  readonly version: 1;
  readonly maxStopRetries: number;
  readonly rules: readonly Rule[];
}

export interface ConfigError {
  readonly line: number;
  readonly message: string;
}

export type ConfigResult = { readonly ok: true; readonly config: Config } | { readonly ok: false; readonly errors: readonly ConfigError[] };

const DEFAULT_MODE: RuleMode = 'warn';
const DEFAULT_MAX_STOP_RETRIES = 3;
const DEFAULT_TIMEOUT_SECONDS = 60;
/** One hour. Anything longer is a mistake, and Node rejects a timeout it cannot hold in an unsigned int. */
const MAX_TIMEOUT_SECONDS = 3600;
const MODES: readonly RuleMode[] = ['off', 'warn', 'block'];

/** Reads a YAML node's starting line (1-based) for error messages, or 1 if unknown. */
function lineOf(doc: Document, node: unknown): number {
  const range = (node as { range?: readonly number[] } | undefined)?.range;
  if (!range || range[0] === undefined) return 1;
  const before = doc.toString().slice(0, range[0]);
  return before.split('\n').length;
}

function compileGlobs(files: unknown, exclude: unknown): ((path: string) => boolean) | undefined {
  if (files === undefined && exclude === undefined) return undefined;
  const included = Array.isArray(files) && files.length > 0 ? picomatch(files as string[]) : () => true;
  const excluded = Array.isArray(exclude) && exclude.length > 0 ? picomatch(exclude as string[]) : () => false;
  return (path: string) => included(path) && !excluded(path);
}

function compileRegex(source: unknown, errors: ConfigError[], line: number, field: string): RegExp | undefined {
  if (typeof source !== 'string') {
    errors.push({ line, message: `"${field}" must be a string regular expression.` });
    return undefined;
  }
  try {
    return new RegExp(source);
  } catch (cause) {
    errors.push({ line, message: `"${field}" is not a valid regular expression: ${(cause as Error).message}` });
    return undefined;
  }
}

export function parseConfig(source: string): ConfigResult {
  const doc = parseDocument(source, { strict: true });
  const errors: ConfigError[] = doc.errors.map((error) => ({
    line: error.linePos?.[0]?.line ?? 1,
    message: error.message,
  }));
  if (errors.length > 0) return { ok: false, errors };

  const root = doc.contents;
  if (!isMap(root)) {
    return { ok: false, errors: [{ line: 1, message: 'holdfast.yaml must be a mapping at the top level.' }] };
  }

  const rootJson = doc.toJS() as Record<string, unknown>;

  const version = rootJson.version;
  if (version !== 1) {
    errors.push({ line: lineOf(doc, root.get('version', true)), message: '"version" must be 1.' });
  }

  const defaults = (rootJson.defaults ?? {}) as Record<string, unknown>;
  const defaultMode: RuleMode = MODES.includes(defaults.mode as RuleMode) ? (defaults.mode as RuleMode) : DEFAULT_MODE;
  const defaultAllowOverride = defaults.allowOverride !== false;
  const maxStopRetries =
    typeof defaults.maxStopRetries === 'number' && Number.isInteger(defaults.maxStopRetries) && defaults.maxStopRetries >= 0
      ? defaults.maxStopRetries
      : DEFAULT_MAX_STOP_RETRIES;

  const rulesNode = root.get('rules', true);
  const rulesJson = rootJson.rules;
  if (!Array.isArray(rulesJson)) {
    errors.push({ line: lineOf(doc, rulesNode), message: '"rules" must be a list.' });
    return { ok: false, errors };
  }

  const rules: Rule[] = [];
  const seenIds = new Set<string>();

  rulesJson.forEach((raw, index) => {
    const line = lineOf(doc, doc.getIn(['rules', index], true));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({ line, message: `rules[${index}] must be a mapping.` });
      return;
    }
    const rule = raw as Record<string, unknown>;

    const id = typeof rule.id === 'string' && rule.id.trim().length > 0 ? rule.id : undefined;
    if (!id) {
      errors.push({ line, message: `rules[${index}] is missing "id".` });
      return;
    }
    if (seenIds.has(id)) {
      errors.push({ line, message: `Duplicate rule id "${id}".` });
      return;
    }
    seenIds.add(id);

    const type = rule.type;
    if (!RULE_TYPES.includes(type as RuleType)) {
      errors.push({ line, message: `Rule "${id}": "type" must be one of ${RULE_TYPES.join(', ')}.` });
      return;
    }

    const mode = MODES.includes(rule.mode as RuleMode) ? (rule.mode as RuleMode) : defaultMode;
    const allowOverride = typeof rule.allowOverride === 'boolean' ? rule.allowOverride : defaultAllowOverride;
    const matchesPath = compileGlobs(rule.files, rule.exclude);

    const needsMessage = type === 'command' || type === 'line' || type === 'boundary' || type === 'prose';
    const message = typeof rule.message === 'string' && rule.message.trim().length > 0 ? rule.message : undefined;
    if (needsMessage && !message) {
      errors.push({ line, message: `Rule "${id}": "message" is required for type "${String(type)}".` });
      return;
    }

    const common = { id, mode, allowOverride, message: message ?? '', matchesPath };

    switch (type as RuleType) {
      case 'command': {
        const match = compileRegex(rule.match, errors, line, 'match');
        if (!match) return;
        rules.push({ ...common, type: 'command', match });
        break;
      }
      case 'line': {
        const added = rule.added === undefined ? undefined : compileRegex(rule.added, errors, line, 'added');
        const removed = rule.removed === undefined ? undefined : compileRegex(rule.removed, errors, line, 'removed');
        if (rule.added === undefined && rule.removed === undefined) {
          errors.push({ line, message: `Rule "${id}": a "line" rule needs "added" and/or "removed".` });
          return;
        }
        if ((rule.added !== undefined && !added) || (rule.removed !== undefined && !removed)) return;
        rules.push({ ...common, type: 'line', added, removed });
        break;
      }
      case 'boundary': {
        const disallow = Array.isArray(rule.disallow) ? rule.disallow.filter((v): v is string => typeof v === 'string') : [];
        if (disallow.length === 0) {
          errors.push({ line, message: `Rule "${id}": a "boundary" rule needs a non-empty "disallow" list.` });
          return;
        }
        rules.push({ ...common, type: 'boundary', disallow });
        break;
      }
      case 'test-guard': {
        const checks = Array.isArray(rule.checks)
          ? rule.checks.filter((c): c is TestGuardCheck => TEST_GUARD_CHECKS.includes(c as TestGuardCheck))
          : [...TEST_GUARD_CHECKS];
        rules.push({
          ...common,
          mode: typeof rule.mode === 'string' && MODES.includes(rule.mode as RuleMode) ? (rule.mode as RuleMode) : 'block',
          allowOverride: typeof rule.allowOverride === 'boolean' ? rule.allowOverride : false,
          type: 'test-guard',
          checks,
        });
        break;
      }
      case 'checker': {
        const run = typeof rule.run === 'string' && rule.run.trim().length > 0 ? rule.run : undefined;
        if (!run) {
          errors.push({ line, message: `Rule "${id}": "run" is required for a "checker" rule.` });
          return;
        }
        const cwd = typeof rule.cwd === 'string' ? rule.cwd : '.';
        const on = rule.on === 'edit' ? 'edit' : 'stop';
        // Must be finite and bounded: YAML parses `.inf` and `1e400` to
        // Infinity, which is a number and is > 0, and Node's spawnSync throws
        // synchronously on a non-finite timeout — taking every other rule in
        // the file down with it.
        const rawTimeout = rule.timeoutSeconds;
        if (rawTimeout !== undefined && (typeof rawTimeout !== 'number' || !Number.isFinite(rawTimeout) || rawTimeout <= 0 || rawTimeout > MAX_TIMEOUT_SECONDS)) {
          errors.push({ line, message: `Rule "${id}": "timeoutSeconds" must be a number between 1 and ${MAX_TIMEOUT_SECONDS}.` });
          return;
        }
        const timeoutSeconds = typeof rawTimeout === 'number' ? rawTimeout : DEFAULT_TIMEOUT_SECONDS;
        const when = Array.isArray(rule.when) && rule.when.length > 0 ? picomatch(rule.when as string[]) : undefined;
        rules.push({ ...common, type: 'checker', run, cwd, on, timeoutSeconds, when });
        break;
      }
      case 'prose': {
        const match = compileRegex(rule.match, errors, line, 'match');
        if (!match) return;
        rules.push({ ...common, type: 'prose', match });
        break;
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { version: 1, maxStopRetries, rules } };
}

/** True if the rule's `files`/`exclude` globs (or absence of them) allow this path. */
export function ruleAppliesTo(rule: Rule, path: string): boolean {
  return rule.matchesPath === undefined || rule.matchesPath(path);
}
