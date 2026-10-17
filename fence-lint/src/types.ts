export type Profile = 'outward' | 'internal' | 'agent-report';
export const PROFILES: readonly Profile[] = ['outward', 'internal', 'agent-report'];
export type Severity = 'error' | 'warn';

export interface PatternSpec {
  regex: string;
  flags?: string;
  message: string;
  /** The named group `label` must be one of the configured ladder labels (and match `num` if present). */
  labelAllow?: 'ladder';
  /** Look up the matched term in the outward term list and append its plain replacement. */
  suggestFrom?: 'terms';
  /** Do not echo the matched text (it may be a person's name). */
  redact?: boolean;
}

export interface CooccurrenceSpec {
  message: string;
  anchor: string;
  with: string[];
  flags?: string;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  profiles: Profile[];
  source: string;
  alsoSee?: string[];
  rationale: string;
  fix?: string;
  scope: 'line' | 'sentence';
  linePrefix?: string;
  negationWindow?: number;
  unless?: string[];
  cooccurrence?: CooccurrenceSpec;
  patterns: PatternSpec[];
}

export interface Term {
  term: string;
  suggest?: string;
  kind?: string;
}

export interface Context {
  roster: string[];
  personWords: string[];
  ladder: string[];
  rivalLabels: string[];
  terms: Term[];
}

export interface Finding {
  file?: string;
  ruleId: string;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  endColumn: number;
  match: string;
  source?: string;
}

export interface Suppressed extends Finding {
  reason: string;
  disableLine: number;
}

export interface LintResult {
  findings: Finding[];
  suppressed: Suppressed[];
}
