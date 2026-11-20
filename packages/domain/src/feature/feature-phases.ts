// SPDX-License-Identifier: Apache-2.0
// Feature-scoped phase stepper (US-084, FR-105, ADR-017): deterministic phase states per feature with soft gates
// (FR-080), the feature steps of the next-step engine and the project's maintenance mode.
import type { PhaseState } from '../project/phase.js';
import type { BoardStatus } from '../story/state-machine.js';
import type { FeatureStatus } from './feature-status.js';

export const FEATURE_PHASES = ['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review'] as const;
export type FeaturePhase = (typeof FEATURE_PHASES)[number];

export interface FeatureProgress {
  id: string;
  title: string;
  approval: 'draft' | 'approved';
  status: FeatureStatus;
  /** Impact analysis (US-085): not started, an `impact` run is analysing, items proposed, or confirmed by the user. */
  impact: 'not_started' | 'analysing' | 'proposed' | 'confirmed';
  /** Delta change sets (US-087/US-088): none, open for review, or applied. */
  requirementsDelta: 'none' | 'open' | 'applied';
  designDelta: 'none' | 'open' | 'applied';
  /** Stories linked with `feature: FI-xxx`. */
  stories: readonly { status: BoardStatus; approval: 'draft' | 'approved' }[];
  /** The feature's epic review is decided (US-091). */
  epicReviewed: boolean;
}

export interface FeaturePhaseStatus {
  phase: FeaturePhase;
  state: PhaseState;
  /** Soft gate: earlier phases that are not approved yet (a warning, never a block). */
  unapprovedEarlier: FeaturePhase[];
  enabled: true;
}

const deltaState = (delta: FeatureProgress['requirementsDelta']): PhaseState =>
  delta === 'applied' ? 'approved' : delta === 'open' ? 'awaiting_approval' : 'not_started';

function phaseStates(p: FeatureProgress): Record<FeaturePhase, PhaseState> {
  const stories = p.stories;
  const allDone = stories.length > 0 && stories.every((s) => s.status === 'done');
  return {
    intent: p.approval === 'approved' ? 'approved' : 'awaiting_approval',
    impact: { not_started: 'not_started', analysing: 'in_progress', proposed: 'awaiting_approval', confirmed: 'approved' }[
      p.impact
    ] as PhaseState,
    requirements: deltaState(p.requirementsDelta),
    design: deltaState(p.designDelta),
    stories: stories.length === 0 ? 'not_started' : stories.every((s) => s.approval === 'approved') ? 'approved' : 'awaiting_approval',
    kanban: allDone ? 'approved' : stories.some((s) => s.status !== 'backlog') ? 'in_progress' : 'not_started',
    epic_review: p.epicReviewed ? 'approved' : allDone ? 'awaiting_approval' : 'not_started',
  };
}

export function featurePhases(p: FeatureProgress): { phases: FeaturePhaseStatus[]; current: FeaturePhase } {
  const states = phaseStates(p);
  const phases = FEATURE_PHASES.map((phase, i) => ({
    phase,
    state: states[phase],
    unapprovedEarlier: FEATURE_PHASES.slice(0, i).filter((earlier) => states[earlier] !== 'approved'),
    enabled: true as const,
  }));
  return { phases, current: phases.find((x) => x.state !== 'approved')?.phase ?? 'epic_review' };
}

export type FeatureStepCode = 'feature_step' | 'wait_feature';

export interface FeatureStep {
  code: FeatureStepCode;
  label: string;
  target: { area: 'feature'; featureId: string };
  reason: string;
}

/** The next step of one feature, or undefined when it needs nothing from the user (done, withdrawn, stories running). */
export function featureNextStep(p: FeatureProgress): FeatureStep | undefined {
  if (p.status === 'done' || p.status === 'withdrawn') return undefined;
  const states = phaseStates(p);
  const step = (label: string, reason: string, code: FeatureStepCode = 'feature_step'): FeatureStep => ({
    code,
    label,
    target: { area: 'feature', featureId: p.id },
    reason,
  });
  if (states.intent !== 'approved') return step(`Approve ${p.id} ${p.title}`, 'The feature intent is the source of the feature work.');
  if (states.impact === 'in_progress')
    return step(`Impact analysis of ${p.id} is running`, 'Review the impact when it is ready.', 'wait_feature');
  if (states.impact === 'not_started')
    return step(`Analyse the impact of ${p.id}`, 'See which specifications, stories and code the feature touches.');
  if (states.impact === 'awaiting_approval') return step(`Review impact of ${p.id}`, 'Confirm the impact before changing specifications.');
  for (const [phase, name] of [
    ['requirements', 'requirements'],
    ['design', 'design'],
  ] as const) {
    if (states[phase] === 'awaiting_approval') return step(`Approve delta ${name} for ${p.id}`, `The delta ${name} wait for your review.`);
    if (states[phase] === 'not_started')
      return step(`Generate delta ${name} for ${p.id}`, `The impact is confirmed; the ${name} changes are next.`);
  }
  if (states.stories === 'not_started') return step(`Plan the epic and stories for ${p.id}`, 'The delta specifications are approved.');
  if (states.stories === 'awaiting_approval')
    return step(`Approve the stories of ${p.id}`, 'Approved stories can be planned on the board.');
  if (states.epic_review === 'awaiting_approval') return step(`Review the epic of ${p.id}`, 'All stories of the feature are Done.');
  return undefined;
}

/** The project-level stepper shows *Maintenance* once all initial epics (not created by a feature) exist and are Done. */
export function maintenanceMode(epics: readonly { featureId: string | null; done: boolean }[]): boolean {
  const initial = epics.filter((e) => e.featureId === null);
  return initial.length > 0 && initial.every((e) => e.done);
}
