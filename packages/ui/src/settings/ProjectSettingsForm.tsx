// SPDX-License-Identifier: Apache-2.0
// Project settings (US-016, UF-08 §4): instructions & conventions, Git conventions, worktree folder, snapshot
// exclusions and parallel runs (locked to 1 without Git).
import { useState, type FormEvent } from 'react';
import type { CommandInput, CommandOutput, QueryOutput } from '@specforge/ipc-contract';

export type ProjectSettingsView = QueryOutput<'projectSettings.get'>;
type Settings = CommandInput<'projectSettings.save'>['settings'];

export interface ProjectSettingsFormProps {
  view: ProjectSettingsView;
  onSave(settings: Settings): Promise<CommandOutput<'projectSettings.save'>>;
  onSaveInstructions(content: string, expectedHash: string | null): Promise<CommandOutput<'projectSettings.saveInstructions'>>;
}

export function ProjectSettingsForm({ view, onSave, onSaveInstructions }: ProjectSettingsFormProps) {
  const git = view.vcsMode === 'git';
  const [instructions, setInstructions] = useState(view.instructions.content);
  const [instructionsHash, setInstructionsHash] = useState(view.instructions.hash);
  const [instructionsResult, setInstructionsResult] = useState<{ ok: boolean; text: string } | undefined>();
  const [baseBranch, setBaseBranch] = useState(view.settings.baseBranch);
  const [branchPattern, setBranchPattern] = useState(view.settings.branchPattern);
  const [worktreeRoot, setWorktreeRoot] = useState(view.settings.worktreeRoot);
  const [exclusions, setExclusions] = useState(view.settings.snapshotExclusions.join('\n'));
  const [limit, setLimit] = useState(String(view.settings.concurrencyLimit));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const saveInstructions = async (): Promise<void> => {
    const result = await onSaveInstructions(instructions, instructionsHash);
    if (result.ok) setInstructionsHash(result.hash);
    setInstructionsResult(result.ok ? { ok: true, text: 'Instructions saved' } : { ok: false, text: result.error });
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await onSave({
      baseBranch: baseBranch.trim(),
      branchPattern: branchPattern.trim(),
      worktreeRoot: worktreeRoot.trim(),
      snapshotExclusions: exclusions
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== ''),
      concurrencyLimit: Number(limit),
    });
    setErrors(result.ok ? [] : result.errors);
    setSaved(result.ok);
  };

  return (
    <section aria-label="Project settings">
      <h2>Project</h2>
      <label>
        Project instructions & conventions
        <textarea rows={8} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <p className="hint">Stored in .specforge/instructions.md and given to the agent with every run.</p>
      <button type="button" onClick={() => void saveInstructions()}>
        Save instructions
      </button>
      {instructionsResult && <p role={instructionsResult.ok ? 'status' : 'alert'}>{instructionsResult.text}</p>}

      <form onSubmit={(e) => void submit(e)} aria-label="Git and execution settings">
        <label>
          Base branch
          <input value={baseBranch} disabled={!git} onChange={(e) => setBaseBranch(e.target.value)} />
        </label>
        <label>
          Branch pattern
          <input value={branchPattern} disabled={!git} onChange={(e) => setBranchPattern(e.target.value)} />
        </label>
        <label>
          Worktree folder
          <input value={worktreeRoot} disabled={!git} onChange={(e) => setWorktreeRoot(e.target.value)} />
        </label>
        <label>
          Snapshot exclusions (one per line)
          <textarea rows={4} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
        </label>
        <label>
          Parallel runs
          <input
            type="number"
            min={1}
            max={10}
            value={git ? limit : view.effectiveConcurrency}
            disabled={!git}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        {view.concurrencyNote && <p className="hint">{view.concurrencyNote}</p>}
        {errors.length > 0 && (
          <div role="alert">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        <button type="submit">Save project settings</button>
        {saved && <span aria-live="polite">Saved</span>}
      </form>
    </section>
  );
}
