/**
 * import-stewards: fold a steward sheet (CSV or Markdown table with the
 * columns rule | owner | backup | runs_without_founder) into plan scope items.
 * Rules are data; nothing is hard-coded. Owner/backup cells are treated as
 * ROLE LABELS - only the owner maps labels to people, outside this kit.
 */
import type { AbsencePlan, ScopeItem } from "./plan.ts";

export interface StewardRow {
  rule: string;
  owner: string;
  backup: string;
  runsWithoutFounder: boolean | null;
}

const COLUMNS = ["rule", "owner", "backup", "runs_without_founder"] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function parseMarkdown(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .filter((l) => !/^\|[\s:|-]+\|?$/.test(l)) // separator row
    .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
}

function toBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

export function parseStewardTable(text: string): StewardRow[] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().startsWith("|") || /,/.test(l)) ?? "";
  const grid = firstLine.trim().startsWith("|") ? parseMarkdown(text) : parseCsv(text);
  if (grid.length === 0) throw new Error("steward sheet is empty");
  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idx: Record<string, number> = {};
  for (const col of COLUMNS) {
    const i = header.indexOf(col);
    if (i < 0) throw new Error(`steward sheet is missing column "${col}" (need ${COLUMNS.join(" | ")})`);
    idx[col] = i;
  }
  return grid
    .slice(1)
    .map((r) => ({
      rule: (r[idx.rule] ?? "").trim(),
      owner: (r[idx.owner] ?? "").trim(),
      backup: (r[idx.backup] ?? "").trim(),
      runsWithoutFounder: toBool(r[idx.runs_without_founder] ?? ""),
    }))
    .filter((r) => r.rule !== "");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "rule";
}

/** Returns a new plan; the input is not mutated. */
export function importStewards(plan: AbsencePlan, rows: StewardRow[]): AbsencePlan {
  const next: AbsencePlan = structuredClone(plan);
  const founder = next.absence.founderRole;
  const labels = new Set(next.roles.map((r) => r.label));

  const role = (cell: string): string => {
    const v = cell.trim();
    if (v === "") return "";
    if (/[@<>]|\d{6,}/.test(v) || v.length > 40) {
      throw new Error(`"${v}" does not look like a role label; the sheet must carry role labels only, never names or contacts`);
    }
    if (v.toLowerCase() === "founder") return founder;
    if (!labels.has(v)) {
      next.roles.push({ label: v, kind: "holder" });
      labels.add(v);
    }
    return v;
  };

  const ids = new Set(next.scope.map((s) => s.id));
  for (const r of rows) {
    const holder = role(r.owner);
    const backup = role(r.backup);
    const existing = next.scope.find((s) => s.title.toLowerCase() === r.rule.toLowerCase());
    if (existing) {
      existing.holder = holder;
      existing.backup = backup;
      existing.runsWithoutFounder = r.runsWithoutFounder;
      continue;
    }
    let id = `rule-${slug(r.rule)}`;
    for (let n = 2; ids.has(id); n++) id = `rule-${slug(r.rule)}-${n}`;
    ids.add(id);
    const item: ScopeItem = { id, title: r.rule, holder, backup, runsWithoutFounder: r.runsWithoutFounder };
    next.scope.push(item);
  }
  return next;
}
