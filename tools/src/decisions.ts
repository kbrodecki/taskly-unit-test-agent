import { z } from 'zod';
import type { AgentInput } from './input.ts';

const MODEL_SKIP_REASONS = ['no-behavior-change', 'already-covered', 'covered-by-author', 'wiring', 'needs-refactor'] as const;
const CATEGORIES = ['happy-path', 'boundaries', 'validation-error', 'network-or-repository-error', 'double-submit', 'loading-and-disabled-state'] as const;

const text = z.string().trim().min(1).max(300);

const entry = z.strictObject({
  file: z.string().min(1),
  decision: z.enum(['create', 'update', 'skip']),
  reason: z.enum(MODEL_SKIP_REASONS).optional(),
  rationale: text,
  testFile: z.string().optional(),
  cases: z.array(text).max(30).default([]),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  rejected: z.array(z.strictObject({ case: text, reason: text })).default([]),
});

const decisionsSchema = z.strictObject({
  mode: z.enum(['pr', 'backfill']),
  files: z.array(entry),
});

export type Decisions = z.infer<typeof decisionsSchema>;
export type DecisionEntry = Decisions['files'][number];

export type Validation = { ok: true; decisions: Decisions } | { ok: false; errors: string[] };

export function validateDecisions(raw: unknown, input: AgentInput): Validation {
  const parsed = decisionsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`) };
  }
  const decisions = parsed.data;
  const errors: string[] = [];
  const byPath = new Map(input.files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  if (decisions.mode !== input.mode) errors.push(`mode is ${decisions.mode}, expected ${input.mode}`);
  for (const item of decisions.files) {
    const file = byPath.get(item.file);
    if (!file) {
      errors.push(`${item.file}: not in the agent input`);
      continue;
    }
    if (seen.has(item.file)) errors.push(`${item.file}: more than one decision`);
    seen.add(item.file);
    if (item.decision === 'skip') {
      if (!item.reason) errors.push(`${item.file}: skip needs a reason`);
      if ((item.reason === 'already-covered' || item.reason === 'covered-by-author') && file.uncoveredChangedLines.length > 0) {
        errors.push(`${item.file}: ${item.reason} is not allowed while changed lines ${file.uncoveredChangedLines.join(', ')} are uncovered`);
      }
      continue;
    }
    if (item.reason) errors.push(`${item.file}: only skip takes a reason`);
    if (item.decision === 'create' && file.testExists) errors.push(`${item.file}: ${file.testPath} exists, use update or skip`);
    if (item.decision === 'update' && !file.testExists) errors.push(`${item.file}: ${file.testPath} does not exist, use create or skip`);
    if (item.testFile !== file.testPath) errors.push(`${item.file}: testFile must be ${file.testPath}`);
    if (item.cases.length === 0) errors.push(`${item.file}: ${item.decision} needs at least one case`);
  }
  for (const path of byPath.keys()) {
    if (!seen.has(path)) errors.push(`${path}: missing decision`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, decisions };
}
