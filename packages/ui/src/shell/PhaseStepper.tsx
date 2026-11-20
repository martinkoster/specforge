// SPDX-License-Identifier: Apache-2.0
// Guided phases (US-033, UC-031, UF-09, FR-080/FR-081): Intent → Requirements → Design → User stories → Kanban with
// derived status, the recommended phase, the loop of the current phase and a soft gate for unapproved inputs.
import { Circle, CircleCheck, CircleDashed, CircleDot, Lock } from 'lucide-react';
import { Dialog } from '../components/index.js';
import { Icon } from '../components/icons.js';
import { useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';

export type PhaseStatus = QueryOutput<'phases.status'>;
export type GuidedPhase = PhaseStatus['phases'][number]['phase'];

const LABEL: Record<GuidedPhase, string> = {
  intent: 'Intent',
  requirements: 'Requirements',
  design: 'Design',
  stories: 'User stories',
  kanban: 'Kanban',
};
const STEPS = [
  { id: 'write', label: 'Write / Generate' },
  { id: 'quality_check', label: 'Quality check' },
  { id: 'review', label: 'Review & refine' },
  { id: 'approve', label: 'Approve' },
] as const;

export interface PhaseStepperProps {
  status: PhaseStatus;
  /** The phase whose screen is shown. */
  current: GuidedPhase | null;
  onOpen(phase: GuidedPhase): void;
}

type PhaseEntry = PhaseStatus['phases'][number];

/** Visual state of a step (US-072 AC-4): done, current, blocked, started or to do. */
function stepState(phase: PhaseEntry, current: GuidedPhase | null): 'done' | 'current' | 'blocked' | 'started' | 'todo' {
  if (!phase.enabled) return 'blocked';
  if (phase.phase === current) return 'current';
  if (phase.state === 'approved') return 'done';
  return phase.state === 'not_started' ? 'todo' : 'started';
}

const STEP_ICON = { done: CircleCheck, current: CircleDot, blocked: Lock, started: CircleDashed, todo: Circle } as const;

export function PhaseStepper({ status, current, onOpen }: PhaseStepperProps) {
  const [gate, setGate] = useState<{ phase: GuidedPhase; inputs: string[] } | null>(null);
  const shown = status.phases.find((p) => p.phase === current);

  const open = (phase: PhaseStatus['phases'][number]) => {
    if (phase.unapprovedInputs.length > 0) setGate({ phase: phase.phase, inputs: phase.unapprovedInputs });
    else onOpen(phase.phase);
  };

  return (
    <div className="phase-stepper">
      {status.maintenance && (
        <span className="badge badge-success" title="All initial epics are Done; new work comes as features.">
          Maintenance
        </span>
      )}
      <nav aria-label="Phases">
        {status.phases.map((p) => (
          <button
            key={p.phase}
            type="button"
            className={`phase-step phase-${stepState(p, current)}`}
            aria-current={p.phase === current ? 'step' : undefined}
            disabled={!p.enabled}
            title={p.enabled ? undefined : 'Available once user stories exist.'}
            onClick={() => open(p)}
          >
            <Icon icon={STEP_ICON[stepState(p, current)]} />
            <span>
              {LABEL[p.phase]} · {p.state.replace('_', ' ')}
              {p.phase === status.recommended ? ' (recommended)' : ''}
            </span>
          </button>
        ))}
      </nav>
      {shown && shown.phase !== 'kanban' && (
        <ol aria-label={`${LABEL[shown.phase]} loop`} className="phase-loop">
          {STEPS.map((s) => (
            <li key={s.id} aria-current={s.id === shown.step ? 'step' : undefined}>
              {s.label}
            </li>
          ))}
        </ol>
      )}
      {gate && (
        <Dialog role="alertdialog" title={<>Inputs not approved yet</>} onClose={() => setGate(null)}>
          <p>
            {gate.inputs.map((i) => LABEL[i as GuidedPhase] ?? i).join(', ')} {gate.inputs.length === 1 ? 'is' : 'are'} not approved yet.
            Work in {LABEL[gate.phase]} may need rework later.
          </p>
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setGate(null)}>
              Go back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                onOpen(gate.phase);
                setGate(null);
              }}
            >
              Continue
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
