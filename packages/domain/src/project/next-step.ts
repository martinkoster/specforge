// SPDX-License-Identifier: Apache-2.0
// Recommended next step (domain_model.md NextStep, ADR-017, FR-086): a pure function with a fixed priority list.
import { SPEC_PHASES, phaseState, type PhaseInputs, type SpecPhase } from './phase.js';

export interface NextStepInput {
  setupComplete: boolean;
  pendingPermissions: number;
  /** Stories whose latest run failed or was interrupted. */
  failedRuns: readonly string[];
  reviewStories: readonly string[];
  /** Queued stories blocked by a merge conflict. */
  conflictStories: readonly string[];
  epicsAwaitingReview: readonly string[];
  decisionsInFlight: number;
  phases: PhaseInputs;
  generating: readonly SpecPhase[];
  openDecisions: number;
  readyStories: number;
  freeSlots: number;
  /** Approved stories whose branches the user has not merged yet (FR-115). */
  approvedUnmerged: number;
  storyCount: number;
  doneStories: number;
}

export type NextStepTarget =
  | { area: 'setup' | 'pending' | 'intent' | 'decisions' }
  | { area: 'kanban'; storyId?: string }
  | { area: 'specifications'; generate?: SpecPhase };

export type NextStepCode =
  | 'complete_setup'
  | 'answer_permissions'
  | 'handle_failed_runs'
  | 'review_stories'
  | 'resolve_conflicts'
  | 'review_epic'
  | 'finish_decisions'
  | 'write_intent'
  | 'generate_phase'
  | 'approve_phase'
  | 'review_impacted'
  | 'wait_generation'
  | 'decide_items'
  | 'start_stories'
  | 'merge_branches'
  | 'plan_next_increment'
  | 'prepare_stories';

export interface NextStep {
  code: NextStepCode;
  label: string;
  target: NextStepTarget;
  reason: string;
}

const PHASE_NAME: Record<SpecPhase, string> = { intent: 'intent', requirements: 'requirements', design: 'design', stories: 'user stories' };
const GENERATE_LABEL: Record<Exclude<SpecPhase, 'intent'>, string> = {
  requirements: 'Generate the requirements',
  design: 'Generate the design',
  stories: 'Generate epics and user stories',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const first = (ids: readonly string[]) => [...ids].sort()[0]!;
const capitalised = (text: string) => text[0]!.toUpperCase() + text.slice(1);

function phaseAction(input: NextStepInput): NextStep | undefined {
  for (const phase of SPEC_PHASES) {
    const state = phaseState(input.phases[phase], { generating: input.generating.includes(phase) });
    const name = PHASE_NAME[phase];
    const area = phase === 'intent' ? ('intent' as const) : ('specifications' as const);
    switch (state) {
      case 'approved':
        continue;
      case 'impacted':
        return {
          code: 'review_impacted',
          label: `Review the potentially impacted ${name}`,
          target: { area },
          reason: `An earlier phase changed after the ${name} were approved.`,
        };
      case 'in_progress':
        return {
          code: 'wait_generation',
          label: `${capitalised(name)} generation is running`,
          target: { area },
          reason: 'Review the changes when the agent has finished.',
        };
      case 'awaiting_approval':
        return {
          code: 'approve_phase',
          label: `Review and approve the ${name}`,
          target: { area },
          reason: `The next phase builds on the approved ${name}.`,
        };
      case 'not_started':
        if (phase === 'intent') {
          return {
            code: 'write_intent',
            label: 'Write the intent',
            target: { area: 'intent' },
            reason: 'Every project starts with its intent.',
          };
        }
        return {
          code: 'generate_phase',
          label: GENERATE_LABEL[phase],
          target: { area: 'specifications', generate: phase },
          reason: `The previous phase is approved; the ${name} are next.`,
        };
    }
  }
  return undefined;
}

export function nextStep(input: NextStepInput): NextStep {
  if (!input.setupComplete) {
    return {
      code: 'complete_setup',
      label: 'Complete the setup',
      target: { area: 'setup' },
      reason: 'AI functions are disabled until an agent and a provider are configured.',
    };
  }
  if (input.pendingPermissions > 0) {
    return {
      code: 'answer_permissions',
      label: `Answer ${plural(input.pendingPermissions, 'permission request')}`,
      target: { area: 'pending' },
      reason: 'Agents are waiting for your decision.',
    };
  }
  if (input.failedRuns.length > 0) {
    return {
      code: 'handle_failed_runs',
      label: `Handle ${plural(input.failedRuns.length, 'failed or interrupted run')}`,
      target: { area: 'kanban', storyId: first(input.failedRuns) },
      reason: 'Retry, resume or discard them to continue.',
    };
  }
  if (input.reviewStories.length > 0) {
    return {
      code: 'review_stories',
      label: input.reviewStories.length === 1 ? `Review ${input.reviewStories[0]}` : `Review ${input.reviewStories.length} stories`,
      target: { area: 'kanban', storyId: first(input.reviewStories) },
      reason: 'Completed implementations are waiting for your review.',
    };
  }
  if (input.conflictStories.length > 0) {
    return {
      code: 'resolve_conflicts',
      label: `Resolve ${plural(input.conflictStories.length, 'blocked story', 'blocked stories')}`,
      target: { area: 'kanban', storyId: first(input.conflictStories) },
      reason: 'Their base could not be prepared because of a merge conflict.',
    };
  }
  if (input.epicsAwaitingReview.length > 0) {
    return {
      code: 'review_epic',
      label: `Review epic ${first(input.epicsAwaitingReview)}`,
      target: { area: 'kanban' },
      reason: 'All stories of the epic are Done.',
    };
  }
  if (input.decisionsInFlight > 0) {
    return {
      code: 'finish_decisions',
      label: `Finish ${plural(input.decisionsInFlight, 'decision')} in progress`,
      target: { area: 'decisions' },
      reason: 'Options were prepared and wait for your choice.',
    };
  }
  const phase = phaseAction(input);
  if (phase) return phase;
  if (input.openDecisions > 0) {
    return {
      code: 'decide_items',
      label: `Decide ${plural(input.openDecisions, 'open item')}`,
      target: { area: 'decisions' },
      reason: 'Open decision items may change what gets built.',
    };
  }
  if (input.readyStories > 0 && input.freeSlots > 0) {
    return {
      code: 'start_stories',
      label: `Start stories (${input.readyStories} ready, ${plural(input.freeSlots, 'free slot')})`,
      target: { area: 'kanban' },
      reason: 'Move Ready stories to In Progress to start their runs.',
    };
  }
  if (input.approvedUnmerged > 0) {
    return {
      code: 'merge_branches',
      label: `Merge ${plural(input.approvedUnmerged, 'approved branch', 'approved branches')}`,
      target: { area: 'kanban' },
      reason: 'SpecForge never merges; merge them into your branch yourself.',
    };
  }
  if (input.storyCount > 0 && input.doneStories === input.storyCount) {
    return {
      code: 'plan_next_increment',
      label: 'Plan next increment',
      target: { area: 'intent' },
      reason: 'All stories are Done.',
    };
  }
  return {
    code: 'prepare_stories',
    label: 'Prepare stories for implementation',
    target: { area: 'kanban' },
    reason: 'Move stories to Ready once they are refined and approved.',
  };
}
