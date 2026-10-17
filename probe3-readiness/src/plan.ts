import { readFileSync } from "node:fs";

/** Types mirror absence-plan.schema.json. Every person reference is a role label. */
export type RoleKind = "founder" | "co-driver" | "holder" | "welcomer" | "member" | "other";
export type EmergencyClass = "harm_to_person" | "reputational_damage" | "money_legal";
export type Cadence = "weekly" | "biweekly" | "monthly" | "unset";
export type Weekday =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday" | "unset";

export interface Role { label: string; kind: RoleKind }

export interface ScopeItem {
  id: string;
  title: string;
  holder: string;
  backup: string;
  runsWithoutFounder?: boolean | null;
}

export interface Rehearsal {
  date: string;
  kind: "live-step-back" | "tabletop";
  durationDays?: number;
  holderActedWithoutFounder: boolean;
  notes?: string;
}

export interface AbsencePlan {
  $schema?: string;
  planVersion: "0.1";
  doctrineStatus: "v0.1-unratified";
  planId: string;
  absence: {
    probe: string;
    departureDate: string;
    returnDate?: string | null;
    founderRole: string;
    primaryHolder: string;
    primaryBackup: string;
  };
  roles: Role[];
  thresholds?: { maxScopePerHolder?: number };
  responseWindow: { cadence: "weekly" | "unset"; day: Weekday };
  emergencyInterrupts: Array<{ class: EmergencyClass; firstResponder: string }>;
  scope: ScopeItem[];
  heartbeat: {
    peerSession: { cadence: Cadence; rotatingHost: boolean; holder: string };
    asyncPulse: { cadence: Cadence; holder: string };
    warmthLoop: { messagesPlanned: number; holder: string };
  };
  runwayGate: {
    coastPageWritten: boolean;
    handoffRitualDone: boolean;
    zeroOpsWeek: { start: string; end: string; founderInterventions: number } | null;
  };
  formation: { ownersBesidesFounder: number; coDriverVacuumLevel3Passed: boolean };
  reunion: { date: string | null; announced?: boolean };
  rehearsals: Rehearsal[];
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Whole days from a to b (YYYY-MM-DD, UTC). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
