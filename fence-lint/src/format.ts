import type { Finding, Suppressed } from './types.ts';

export interface FileReport {
  file: string;
  findings: Finding[];
  suppressed: Suppressed[];
}

export function summarize(reports: FileReport[]) {
  const all = reports.flatMap((r) => r.findings);
  return {
    files: reports.length,
    errors: all.filter((f) => f.severity === 'error').length,
    warnings: all.filter((f) => f.severity === 'warn').length,
    suppressed: reports.reduce((n, r) => n + r.suppressed.length, 0),
  };
}

export function formatText(reports: FileReport[]): string {
  const out: string[] = [];
  for (const r of reports) {
    for (const f of r.findings) {
      out.push(`${r.file}:${f.line}:${f.column}  ${f.severity.padEnd(5)}  ${f.ruleId.padEnd(3)}  ${f.message}${f.match && f.ruleId !== 'FL0' ? (f.match === '[redacted]' ? '  [redacted]' : `  [${f.match}]`) : ''}`);
    }
    for (const s of r.suppressed) {
      out.push(`${r.file}:${s.line}:${s.column}  off    ${s.ruleId.padEnd(3)}  suppressed by line ${s.disableLine}: ${s.reason}`);
    }
  }
  const s = summarize(reports);
  out.push(`fence-lint: ${s.errors} error(s), ${s.warnings} warning(s), ${s.suppressed} suppressed, ${s.files} file(s)`);
  return out.join('\n') + '\n';
}

export function formatJson(reports: FileReport[], profile: string): string {
  return (
    JSON.stringify(
      {
        profile,
        findings: reports.flatMap((r) => r.findings.map((f) => ({ ...f, file: r.file }))),
        suppressed: reports.flatMap((r) => r.suppressed.map((f) => ({ ...f, file: r.file }))),
        summary: summarize(reports),
      },
      null,
      2,
    ) + '\n'
  );
}
