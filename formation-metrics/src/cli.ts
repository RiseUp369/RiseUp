/**
 * CLI. Usage:
 *   node src/cli.ts report <events.jsonl> --quarter 2026Q4 [--as-of YYYY-MM-DD] [--config file.json]
 * Reads local files only. No network. Writes to stdout only.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseJsonl } from './contract.ts';
import { mergeConfig, type FormationConfig } from './config.ts';
import { renderReport } from './report.ts';

const USAGE = 'usage: node src/cli.ts report <events.jsonl> --quarter 2026Q4 [--as-of YYYY-MM-DD] [--config config.json]';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function main(argv: string[]): number {
  const [command, file, ...rest] = argv;
  if (command !== 'report' || !file) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const quarter = flag(rest, '--quarter');
  if (!quarter) {
    process.stderr.write(`missing --quarter\n${USAGE}\n`);
    return 2;
  }
  try {
    const configPath = flag(rest, '--config');
    const config: FormationConfig = mergeConfig(configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : undefined);
    const events = parseJsonl(readFileSync(file, 'utf8'));
    const asOf = flag(rest, '--as-of');
    process.stdout.write(renderReport(events, { quarter, sourcePath: file, config, ...(asOf ? { asOf } : {}) }));
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
