import type { Area, ChangedFile } from './changes.ts';
import { type Coverage, uncoveredLines } from './lines.ts';

export type CodeReason = 'filtered' | 'deleted' | 'budget';

export interface InputFile {
  path: string;
  area: Area;
  status: string;
  testPath: string;
  testExists: boolean;
  changedLines: number[];
  uncoveredChangedLines: number[];
}

export interface CodeDecision {
  file: string;
  reason: CodeReason;
  detail: string;
}

export interface AgentInput {
  mode: 'pr' | 'backfill';
  limit: number;
  files: InputFile[];
  codeDecisions: CodeDecision[];
}

export function buildInput(
  mode: AgentInput['mode'],
  changed: ChangedFile[],
  changedLines: Map<string, number[]>,
  coverage: Coverage,
  limit: number,
): AgentInput {
  const codeDecisions: CodeDecision[] = [];
  const candidates: InputFile[] = [];
  for (const file of changed) {
    if (file.kind === 'deleted') {
      codeDecisions.push({ file: file.path, reason: 'deleted', detail: 'file deleted in this change' });
    } else if (file.kind === 'filtered') {
      codeDecisions.push({ file: file.path, reason: 'filtered', detail: file.filterReason ?? 'filtered' });
    } else {
      const lines = changedLines.get(file.path) ?? [];
      candidates.push({
        path: file.path,
        area: file.area!,
        status: file.status,
        testPath: file.testPath!,
        testExists: file.testExists!,
        changedLines: lines,
        uncoveredChangedLines: uncoveredLines(lines, coverage.get(file.path)),
      });
    }
  }
  const ranked = [...candidates].sort(
    (a, b) => b.uncoveredChangedLines.length - a.uncoveredChangedLines.length || a.path.localeCompare(b.path),
  );
  const files = ranked.slice(0, limit);
  for (const file of ranked.slice(limit)) {
    codeDecisions.push({ file: file.path, reason: 'budget', detail: `over the limit of ${limit} files per run` });
  }
  return { mode, limit, files, codeDecisions };
}
