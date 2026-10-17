import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AbsencePlan } from "../src/plan.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TODAY = "2026-10-17";

export function fixturePath(name: string): string {
  return join(ROOT, "fixtures", name);
}

export function fixtureText(name: string): string {
  return readFileSync(fixturePath(name), "utf8");
}

/** Fresh deep copy each call so tests can mutate freely. */
export function fixture(name: string): AbsencePlan {
  return JSON.parse(fixtureText(name)) as AbsencePlan;
}
