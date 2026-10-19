// SPDX-License-Identifier: Apache-2.0
// Project-level PhaseStatus (domain_model.md): derived from artifact approval states and impact flags.

export type SpecPhase = 'intent' | 'requirements' | 'design' | 'stories';
export type GuidedPhase = SpecPhase | 'kanban';
export type PhaseState = 'not_started' | 'in_progress' | 'awaiting_approval' | 'approved' | 'impacted';

export const SPEC_PHASES: readonly SpecPhase[] = ['intent', 'requirements', 'design', 'stories'];

export interface PhaseInput {
  approvals: readonly ('draft' | 'approved')[];
  impacted: boolean;
}

export type PhaseInputs = Record<SpecPhase, PhaseInput>;

export interface PhaseStatus {
  phase: GuidedPhase;
  state: PhaseState;
}

export function phaseState(input: PhaseInput, { generating = false }: { generating?: boolean } = {}): PhaseState {
  if (input.impacted) return 'impacted';
  if (generating) return 'in_progress';
  if (input.approvals.length === 0) return 'not_started';
  return input.approvals.every((a) => a === 'approved') ? 'approved' : 'awaiting_approval';
}

/** Current phase = first phase not approved (soft gate); Kanban once all specification phases are approved. */
export function currentPhase(inputs: PhaseInputs, generating: readonly SpecPhase[] = []): PhaseStatus {
  for (const phase of SPEC_PHASES) {
    const state = phaseState(inputs[phase], { generating: generating.includes(phase) });
    if (state !== 'approved') return { phase, state };
  }
  return { phase: 'kanban', state: 'in_progress' };
}

export function phaseLabel({ phase, state }: PhaseStatus): string {
  return `${phase[0]!.toUpperCase()}${phase.slice(1)} · ${state.replace('_', ' ')}`;
}

/** Step of the uniform phase loop (FR-081): Write/Generate → Quality check → Review & refine → Approve. */
export type PhaseLoopStep = 'write' | 'quality_check' | 'review' | 'approve';

export function phaseLoopStep(state: PhaseState, qualityChecked: boolean): PhaseLoopStep {
  switch (state) {
    case 'not_started':
    case 'in_progress':
      return 'write';
    case 'awaiting_approval':
      return qualityChecked ? 'review' : 'quality_check';
    case 'impacted':
      return 'review';
    case 'approved':
      return 'approve';
  }
}

export interface StepperPhase {
  phase: GuidedPhase;
  state: PhaseState;
  step: PhaseLoopStep;
  enabled: boolean;
}

/** The phase stepper (US-033, FR-080): status per phase, the recommended phase, Kanban once stories exist. */
export function phaseStepper(
  inputs: PhaseInputs,
  options: { storyCount: number; generating?: readonly SpecPhase[]; qualityChecked?: readonly SpecPhase[] },
): { phases: StepperPhase[]; recommended: GuidedPhase } {
  const generating = options.generating ?? [];
  const checked = options.qualityChecked ?? [];
  const phases: StepperPhase[] = SPEC_PHASES.map((phase) => {
    const state = phaseState(inputs[phase], { generating: generating.includes(phase) });
    return { phase, state, step: phaseLoopStep(state, checked.includes(phase)), enabled: true };
  });
  const kanbanEnabled = options.storyCount > 0;
  phases.push({ phase: 'kanban', state: kanbanEnabled ? 'in_progress' : 'not_started', step: 'write', enabled: kanbanEnabled });
  const current = currentPhase(inputs, generating).phase;
  return { phases, recommended: current === 'kanban' && !kanbanEnabled ? 'stories' : current };
}

/** Soft gate (FR-080, FR-013): earlier specification phases that are not approved yet; the intent has no inputs. */
export function unapprovedInputs(phase: GuidedPhase, inputs: PhaseInputs): SpecPhase[] {
  const order: GuidedPhase[] = [...SPEC_PHASES, 'kanban'];
  return SPEC_PHASES.slice(0, order.indexOf(phase))
    .filter((p) => p !== 'intent' || phase === 'requirements')
    .filter((p) => phaseState(inputs[p]) !== 'approved');
}
