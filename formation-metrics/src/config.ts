/**
 * Configuration. Numbers here mirror ratified decisions; labels are config,
 * not code, because the stage-0 label changed from "Prospect" to "Dormant".
 */
export interface FormationConfig {
  /** Labels for stages 0..5, index = stage number. */
  stageLabels: readonly string[];
  /** 14-day ship rate threshold (about 50%, not yet validated on a live run). */
  shipRateThreshold: number;
  /** Concurrent entrants per active welcomer (doctrine). */
  entrantsPerWelcomer: number;
  /** Probe 1: unprompted moves needed from someone other than the co-driver. */
  probe1MinUnpromptedMoves: number;
  /** Probe 1: decision-log evidence floor (an evidence-sufficiency check, not a target). */
  probe1MinDecisionLogEntries: number;
  /** Event types that count as data for each of the five organisational outputs. */
  outputSources: Readonly<Record<OutputKey, readonly string[]>>;
}

export type OutputKey =
  | 'participant_impact'
  | 'contributor_creation'
  | 'capability_creation'
  | 'leader_creation'
  | 'institutional_replication';

export const DEFAULT_CONFIG: FormationConfig = {
  stageLabels: ['Dormant', 'Trial', 'Contributor', 'Owner', 'Driver', 'Cultivator'],
  shipRateThreshold: 0.5,
  entrantsPerWelcomer: 3,
  probe1MinUnpromptedMoves: 1,
  probe1MinDecisionLogEntries: 10,
  outputSources: {
    participant_impact: ['participant.impact'],
    contributor_creation: ['intake.first_ship'],
    capability_creation: ['capability.demonstrated'],
    leader_creation: ['leader.created'],
    institutional_replication: ['replication.signal'],
  },
};

export function stageLabel(stage: number, config: FormationConfig = DEFAULT_CONFIG): string {
  if (!Number.isInteger(stage) || stage < 0 || stage > 5) {
    throw new RangeError(`stage must be an integer 0-5, got ${String(stage)}`);
  }
  const label = config.stageLabels[stage];
  if (!label) throw new RangeError(`config.stageLabels has no label for stage ${stage}`);
  return label;
}

/** Merge a partial JSON config over the defaults (shallow, with outputSources merged by key). */
export function mergeConfig(partial: Partial<FormationConfig> | undefined): FormationConfig {
  if (!partial) return DEFAULT_CONFIG;
  const merged: FormationConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    outputSources: { ...DEFAULT_CONFIG.outputSources, ...(partial.outputSources ?? {}) },
  };
  if (merged.stageLabels.length !== 6) throw new RangeError('config.stageLabels must have exactly 6 labels (stages 0-5)');
  return merged;
}
