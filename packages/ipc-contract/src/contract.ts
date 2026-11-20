// SPDX-License-Identifier: Apache-2.0
// The IPC contract between UI and core (ADR-015): every command, query and event with its zod schema.
import { z } from 'zod';

/** Semantic version of the contract; UI and core must agree on the major version. */
const SpecReview = z.object({
  runId: z.string(),
  projectId: z.string(),
  target: z.string(),
  kind: z.string(),
  instruction: z.string(),
  snapshotId: z.string(),
  parentRunId: z.string().nullable(),
  state: z.enum(['running', 'open', 'failed', 'cancelled', 'kept', 'discarded', 'superseded']),
  files: z.array(z.object({ path: z.string(), change: z.enum(['A', 'M', 'D']), patch: z.string().optional() })),
  issues: z.array(
    z.object({
      path: z.string(),
      kind: z.enum([
        'front_matter',
        'duplicate_id',
        'broken_link',
        'unknown_dependency',
        'dependency_cycle',
        'missing_rationale',
        'incomplete',
        'invalid_rework',
      ]),
      message: z.string(),
    }),
  ),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
const Capabilities = z.object({
  agentAvailable: z.boolean(),
  providerConfigured: z.boolean(),
  gitAvailable: z.boolean(),
  aiAvailable: z.boolean(),
  missing: z.string().nullable(),
});
const Clarification = z.object({
  id: z.string(),
  intentPath: z.string(),
  state: z.enum(['running', 'awaiting_answers', 'complete', 'failed', 'cancelled', 'finished']),
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['question', 'ambiguity', 'alternative', 'assumption']),
      text: z.string(),
      options: z.array(z.string()),
      answer: z.string().nullable(),
    }),
  ),
  proposalRunId: z.string().nullable(),
  reason: z.string().nullable(),
});
const Answers = z.record(z.string(), z.string().max(5000));
const TraceNode = z.object({
  kind: z.enum(['element', 'story', 'run', 'file']),
  id: z.string(),
  label: z.string(),
  path: z.string().optional(),
  runId: z.string().optional(),
  exists: z.boolean(),
  linkType: z.string().optional(),
  impact: z.string().optional(),
});
/** US-087: the feature impact list. */
const ImpactItem = z.object({
  id: z.string(),
  projectId: z.string(),
  featureId: z.string(),
  category: z.enum(['requirement', 'design', 'adr', 'epic', 'story_not_started', 'story_in_flight', 'story_done', 'run', 'code_area']),
  targetRef: z.string(),
  reason: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  origin: z.enum(['trace', 'agent', 'user']),
  confirmed: z.boolean(),
});
const ImpactView = z.object({
  state: z.enum(['not_started', 'analysing', 'proposed', 'confirmed']),
  items: z.array(ImpactItem),
  columns: z.object({ specs: z.array(ImpactItem), work: z.array(ImpactItem), code: z.array(ImpactItem) }),
  analysing: z.boolean(),
});
/** US-089: a delta change set with its items. */
const ChangeSetView = z.object({
  id: z.string(),
  projectId: z.string(),
  featureId: z.string(),
  phase: z.enum(['requirements', 'design', 'stories']),
  runId: z.string(),
  state: z.enum(['running', 'open', 'failed', 'discarded', 'applied']),
  reason: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      changeSetId: z.string(),
      path: z.string(),
      elementId: z.string().nullable(),
      kind: z.enum(['new', 'modified', 'deprecated']),
      before: z.string().nullable(),
      after: z.string(),
      patch: z.string(),
      state: z.enum(['open', 'accepted', 'discarded', 'applied']),
    }),
  ),
});
/** US-095: an idea of the idea inbox (`01_intent/ideas.md`). */
const Idea = z.object({
  id: z.string(),
  text: z.string(),
  note: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  state: z.enum(['new', 'turned_into_feature', 'merged', 'dismissed']),
  featureId: z.string().nullable(),
  dismissReason: z.string().nullable(),
});
/** US-096: a spec baseline (annotated Git tag). */
const Baseline = z.object({
  projectId: z.string(),
  tag: z.string(),
  commit: z.string(),
  createdAt: z.string(),
  featureIds: z.array(z.string()),
  epicIds: z.array(z.string()),
  notes: z.string(),
});
/** US-093 AC-1: the epic proposal of a feature's Epic & stories phase and the approved choice. */
const EpicProposal = z.object({
  newEpic: z.object({ id: z.string(), title: z.string() }),
  extend: z.array(z.object({ id: z.string(), title: z.string(), reason: z.string() })),
  choice: z
    .object({
      projectId: z.string(),
      featureId: z.string(),
      mode: z.enum(['new', 'extend']),
      epicIds: z.array(z.string()),
      title: z.string().nullable(),
      decidedAt: z.string(),
    })
    .nullable(),
});
const FeaturePhase = z.enum(['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review']);
const FeatureView = z.object({
  id: z.string(),
  title: z.string(),
  approval: z.enum(['draft', 'approved']),
  status: z.enum(['draft', 'approved', 'in_delivery', 'done', 'withdrawn']),
  sourceIdea: z.string().nullable(),
  baseline: z.string().nullable(),
  path: z.string(),
  storyCount: z.number().int(),
  /** US-084/US-085: feature-scoped stepper with soft gates, the current phase, next step and story progress. */
  phases: z.array(
    z.object({
      phase: FeaturePhase,
      state: z.enum(['not_started', 'in_progress', 'awaiting_approval', 'approved', 'impacted']),
      unapprovedEarlier: z.array(FeaturePhase),
      enabled: z.boolean(),
    }),
  ),
  current: FeaturePhase,
  nextStep: z.string().nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
});
const WizardDraft = z.object({
  text: z.string().max(20_000),
  motivation: z.string().max(5_000).optional(),
  targetUsers: z.string().max(1_000).optional(),
  priority: z.enum(['must', 'should', 'could']).optional(),
  epicId: z.string().optional(),
  title: z.string().max(200).optional(),
});
const WizardStep = z.enum(['describe', 'review', 'clarify', 'save']);
/** US-083: the AI review of a wizard draft (maintained by the core). */
const FeatureReview = z.object({
  state: z.enum(['running', 'ready', 'failed']),
  runId: z.string(),
  reason: z.string().nullable(),
  parts: z.array(
    z.object({
      id: z.string(),
      section: z.enum(['problem', 'goal', 'in_scope', 'out_of_scope', 'success', 'constraints', 'assumptions']),
      text: z.string(),
      origin: z.enum(['user', 'ai']),
      removed: z.boolean(),
    }),
  ),
  overlaps: z.array(z.object({ ref: z.string(), text: z.string() })),
  conflicts: z.array(z.object({ ref: z.string(), text: z.string() })),
  suggestedEpic: z.object({ id: z.string(), reason: z.string() }).nullable(),
  covered: z.object({ ref: z.string(), text: z.string(), dismissed: z.boolean() }).nullable(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      why: z.string(),
      options: z.array(z.string()),
      answer: z.string().nullable(),
      deferred: z.boolean(),
    }),
  ),
  done: z.boolean(),
});
const FeatureWizard = z.object({
  id: z.string(),
  projectId: z.string(),
  step: WizardStep,
  draft: WizardDraft.extend({ review: FeatureReview.optional() }),
  featureId: z.string().nullable(),
  updatedAt: z.string(),
});
const ChatMessageView = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  runId: z.string().nullable(),
  toolUses: z.array(z.string()),
  recommendations: z.array(z.object({ type: z.string(), storyId: z.string().optional(), text: z.string() })),
  error: z.boolean(),
  createdAt: z.string(),
});
const SpecStart = z.union([z.object({ ok: z.literal(true), runId: z.string() }), z.object({ ok: z.literal(false), reason: z.string() })]);
const SpecDecision = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]);

export const CONTRACT_VERSION = '1.0.0';

const Vcs = z.union([z.object({ mode: z.literal('git'), branch: z.string().nullable() }), z.object({ mode: z.literal('none') })]);
const OpenedProject = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  vcs: Vcs,
  /** Specification root, workspace-relative (US-078, ADR-024). */
  specRoot: z.string().optional(),
  isolationWarning: z.string().nullable(),
});
const BoardStatus = z.enum(['backlog', 'ready', 'in_progress', 'review', 'done']);
const ExecSubState = z.enum(['none', 'queued', 'blocked_conflict', 'preparing', 'running', 'awaiting_permission', 'failed', 'interrupted']);
const MoveOutcome = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]);
const Effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
const AgentSettingsView = z.object({
  model: z.string().optional(),
  effort: Effort.optional(),
  maxTurns: z.number().int().optional(),
  env: z.array(z.object({ name: z.string(), secret: z.boolean(), value: z.string().nullable() })),
});
const ExecDefaults = z.object({
  maxRunDurationS: z.number().int(),
  idleTimeoutS: z.number().int(),
  notifications: z.boolean(),
  logRetentionDays: z.number().int(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  mergeCheckIntervalS: z.number().int(),
});
const SaveSettingsResult = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), errors: z.array(z.string()) })]);
const ConnectionResult = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), error: z.string() })]);
const SetupStepId = z.enum(['runtime', 'provider', 'git', 'rules', 'defaults', 'summary']);
const ProjectSettings = z.object({
  baseBranch: z.string(),
  branchPattern: z.string(),
  worktreeRoot: z.string(),
  snapshotExclusions: z.array(z.string()),
  concurrencyLimit: z.number(),
});
const PendingPermission = z.object({
  id: z.string(),
  runId: z.string(),
  projectId: z.string(),
  runKind: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  cwd: z.string(),
  outsideWorkspace: z.boolean(),
  requestedAt: z.string(),
});
const PendingItem = z.union([
  z.object({ kind: z.literal('permission'), permission: PendingPermission }),
  z.object({ kind: z.enum(['failed', 'interrupted', 'blocked', 'review']), detail: z.string() }),
  z.object({ kind: z.literal('recommendation'), detail: z.string(), id: z.string(), runId: z.string() }),
]);
const DependencyType = z.enum(['blocking', 'related']);
const DependencyChange = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]);

export const CONTRACT = {
  commands: {
    'system.ping': {
      input: z.object({ nonce: z.string() }),
      output: z.object({ nonce: z.string(), pid: z.number().int() }),
    },
    'system.crash': {
      // Honoured by the core only in test mode (SPECFORGE_TEST=1); used to test core restarts.
      input: z.object({}),
      output: z.object({ accepted: z.boolean() }),
    },
    'runtime.detect': {
      input: z.object({}),
      output: z.union([
        z.object({ found: z.literal(true), path: z.string(), version: z.string() }),
        z.object({ found: z.literal(false), searched: z.array(z.string()) }),
      ]),
    },
    'runtime.verify': {
      input: z.object({ path: z.string().min(1) }),
      output: z.union([
        z.object({ ok: z.literal(true), path: z.string(), version: z.string() }),
        z.object({ ok: z.literal(false), error: z.enum(['not_found', 'not_runnable', 'not_claude_code', 'too_old']), message: z.string() }),
      ]),
    },
    'projects.create': {
      input: z.object({ name: z.string(), path: z.string().min(1), initGit: z.boolean() }),
      output: OpenedProject,
    },
    // US-079: bring a folder with existing code under SpecForge (UC-030).
    'projects.adopt': {
      input: z.object({ name: z.string(), path: z.string().min(1), specRoot: z.string(), initGit: z.boolean() }),
      output: OpenedProject,
    },
    'projects.open': {
      input: z.object({ path: z.string().min(1) }),
      output: OpenedProject,
    },
    'projects.openById': {
      input: z.object({ projectId: z.string().min(1) }),
      output: OpenedProject,
    },
    'projects.close': {
      input: z.object({}),
      output: z.object({}),
    },
    'artifact.approve': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ ok: z.literal(true), hash: z.string() }),
    },
    'artifact.save': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1), content: z.string(), expectedHash: z.string().nullable() }),
      output: z.union([
        z.object({ ok: z.literal(true), hash: z.string() }),
        z.object({ ok: z.literal(false), conflict: z.object({ theirs: z.string(), theirsHash: z.string(), diff: z.string() }) }),
      ]),
    },
    'settings.saveAgent': {
      input: z.object({
        scope: z.union([z.object({ kind: z.literal('global') }), z.object({ kind: z.literal('project'), projectId: z.string().min(1) })]),
        settings: z.object({
          model: z.string().optional(),
          effort: Effort.optional(),
          maxTurns: z.number().int().optional(),
          env: z.array(
            z.union([
              z.object({ name: z.string(), secret: z.literal(false), value: z.string() }),
              // A secret without value keeps the stored secret.
              z.object({ name: z.string(), secret: z.literal(true), value: z.string().optional() }),
            ]),
          ),
        }),
      }),
      output: SaveSettingsResult,
    },
    'settings.saveExec': {
      input: z.object({ defaults: ExecDefaults }),
      output: SaveSettingsResult,
    },
    'setup.saveProvider': {
      input: z.object({
        provider: z.union([
          z.object({ kind: z.literal('anthropic_api_key'), apiKey: z.string() }),
          z.object({ kind: z.literal('bedrock'), region: z.string(), profile: z.string().optional() }),
          z.object({ kind: z.literal('vertex'), region: z.string(), projectId: z.string() }),
          z.object({ kind: z.literal('foundry'), resource: z.string(), apiKey: z.string() }),
        ]),
      }),
      output: SaveSettingsResult,
    },
    'setup.testConnection': {
      input: z.object({}),
      output: ConnectionResult,
    },
    'setup.enableRules': {
      input: z.object({ keys: z.array(z.string()) }),
      output: z.object({ created: z.number().int().nonnegative() }),
    },
    'setup.skipStep': {
      input: z.object({ step: SetupStepId }),
      output: z.object({}),
    },
    'setup.complete': {
      input: z.object({}),
      output: z.object({}),
    },
    'setup.skip': {
      input: z.object({}),
      output: z.object({}),
    },
    'projectSettings.save': {
      input: z.object({ projectId: z.string().min(1), settings: ProjectSettings }),
      output: SaveSettingsResult,
    },
    'projectSettings.saveInstructions': {
      input: z.object({ projectId: z.string().min(1), content: z.string(), expectedHash: z.string().nullable() }),
      output: z.union([z.object({ ok: z.literal(true), hash: z.string() }), z.object({ ok: z.literal(false), error: z.string() })]),
    },
    'permission.decide': {
      input: z.object({
        id: z.string().min(1),
        decision: z.enum(['allow', 'deny']),
        message: z.string().optional(),
        /** "Always allow for this project" (not for outside-workspace actions). */
        alwaysAllow: z.boolean().optional(),
      }),
      output: z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]),
    },
    'board.recheck': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: MoveOutcome,
    },
    /** Specification generation through the agent (US-027, ADR-014). */
    'specs.generate': {
      input: z.object({
        projectId: z.string().min(1),
        target: z.enum(['requirements', 'design', 'epics', 'stories', 'test_concepts']),
        instruction: z.string().min(1).max(20_000),
        /** Story generation for selected epics (US-036). */
        epicIds: z.array(z.string().min(1)).optional(),
      }),
      output: SpecStart,
    },
    /** Refine an artifact or one of its sections with AI (US-030). */
    'specs.refine': {
      input: z.object({
        projectId: z.string().min(1),
        path: z.string().min(1),
        section: z.string().min(1).optional(),
        instruction: z.string().trim().min(1).max(20_000),
      }),
      output: SpecStart,
    },
    /** Codebase analysis of an adopted project into draft specifications (US-080, UC-030). */
    'specs.analyze': {
      input: z.object({ projectId: z.string().min(1), limitTo: z.array(z.string().min(1)).optional() }),
      output: SpecStart,
    },
    /** Feature wizard (US-082, UC-043): drafts stored after every step (ADR-025), saved as FI-xxx-<slug>.md. */
    'features.wizard.create': {
      /** `sourceIdea`: *Turn into feature* of an idea (US-095 AC-3). */
      input: z.object({ projectId: z.string().min(1), draft: WizardDraft, sourceIdea: z.string().min(1).optional() }),
      output: FeatureWizard,
    },
    /** US-096 AC-2: creates the spec baseline tag on the base branch. */
    'baselines.create': {
      input: z.object({ projectId: z.string().min(1), tag: z.string().min(1).max(200) }),
      output: Baseline,
    },
    /** US-095: capture and triage ideas. */
    'ideas.capture': {
      input: z.object({
        projectId: z.string().min(1),
        text: z.string().min(1).max(500),
        note: z.string().max(5_000).optional(),
        source: z.enum(['menu', 'dashboard', 'shortcut', 'chat']),
      }),
      output: Idea,
    },
    'ideas.merge': {
      input: z.object({ projectId: z.string().min(1), ideaId: z.string().min(1), featureId: z.string().min(1) }),
      output: Idea,
    },
    'ideas.dismiss': {
      input: z.object({ projectId: z.string().min(1), ideaId: z.string().min(1), reason: z.string().min(1).max(1_000) }),
      output: Idea,
    },
    'features.wizard.update': {
      input: z.object({ wizardId: z.string().min(1), step: WizardStep, draft: WizardDraft }),
      output: FeatureWizard,
    },
    'features.wizard.discard': { input: z.object({ wizardId: z.string().min(1) }), output: z.object({}) },
    /** Feature impact (US-087): propose the trace items, edit, approve. */
    'impact.propose': { input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }), output: ImpactView },
    'impact.add': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1), ref: z.string().max(500) }),
      output: ImpactView,
    },
    'impact.remove': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1), itemId: z.string().min(1) }),
      output: ImpactView,
    },
    'impact.approve': { input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }), output: ImpactView },
    /** US-089: delta generation as a change set; accept / discard per item. */
    /** US-094 AC-2: withdraws a feature (terminal); deletes the chosen not-started stories. */
    'features.withdraw': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1), deleteStories: z.array(z.string().min(1)) }),
      output: z.object({ discarded: z.array(z.string()), deleted: z.array(z.string()), kept: z.array(z.string()) }),
    },
    'delta.generate': {
      input: z.object({
        projectId: z.string().min(1),
        featureId: z.string().min(1),
        phase: z.enum(['requirements', 'design', 'stories']),
      }),
      output: SpecStart,
    },
    /** US-093 AC-1: approves the epic choice (a new epic, or epics of the impact list to extend). */
    'delta.chooseEpic': {
      input: z.object({
        projectId: z.string().min(1),
        featureId: z.string().min(1),
        choice: z.union([
          z.object({ mode: z.literal('new'), title: z.string().optional() }),
          z.object({ mode: z.literal('extend'), epicIds: z.array(z.string().min(1)).min(1) }),
        ]),
      }),
      output: EpicProposal,
    },
    'delta.decide': { input: z.object({ itemId: z.string().min(1), decision: z.enum(['accept', 'discard']) }), output: ChangeSetView },
    'delta.acceptAll': { input: z.object({ changeSetId: z.string().min(1) }), output: ChangeSetView },
    /** US-090: applies the accepted items; files changed since the generation are conflicts (nothing of them applied). */
    'delta.apply': {
      input: z.object({
        changeSetId: z.string().min(1),
        /** US-091: a decision per affected in-flight story. */
        decisions: z.record(z.string(), z.enum(['continue', 'cancel', 'apply_in_corrections'])).optional(),
      }),
      output: z.union([
        z.object({ applied: z.array(z.string()), conflicts: z.array(z.string()) }),
        z.object({
          needsDecision: z.array(
            z.object({ storyId: z.string(), title: z.string(), status: z.string(), subState: z.string(), changes: z.array(z.string()) }),
          ),
        }),
      ]),
    },
    /** US-088: the read-only `impact` agent run (background), cancel. */
    'impact.analyse': { input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }), output: SpecStart },
    'impact.cancel': { input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }), output: z.object({}) },
    /** *Clear flag* of a potentially impacted element or story (US-086). */
    'impact.clear': { input: z.object({ projectId: z.string().min(1), elementId: z.string().min(1) }), output: z.object({}) },
    /** US-083: AI review and clarification of a wizard draft. */
    'features.wizard.review': { input: z.object({ wizardId: z.string().min(1) }), output: SpecStart },
    'features.wizard.answer': {
      input: z.object({ wizardId: z.string().min(1), answers: z.record(z.string(), z.string().max(5_000)) }),
      output: SpecStart,
    },
    'features.wizard.editPart': {
      input: z.object({
        wizardId: z.string().min(1),
        partId: z.string().min(1),
        removed: z.boolean().optional(),
        text: z.string().max(5_000).optional(),
      }),
      output: FeatureWizard,
    },
    'features.wizard.deferQuestion': {
      input: z.object({ wizardId: z.string().min(1), questionId: z.string().min(1) }),
      output: FeatureWizard,
    },
    'features.wizard.dismissCovered': { input: z.object({ wizardId: z.string().min(1) }), output: FeatureWizard },
    'features.wizard.withdraw': { input: z.object({ wizardId: z.string().min(1) }), output: z.object({}) },
    'features.wizard.merge': {
      input: z.object({ wizardId: z.string().min(1), featureId: z.string().min(1) }),
      output: z.object({ path: z.string() }),
    },
    'features.wizard.save': {
      input: z.object({ wizardId: z.string().min(1), title: z.string(), approve: z.boolean() }),
      output: z.object({ featureId: z.string(), path: z.string() }),
    },
    'specs.keep': { input: z.object({ runId: z.string().min(1) }), output: SpecDecision },
    'specs.discard': { input: z.object({ runId: z.string().min(1) }), output: SpecDecision },
    /** Ask agent to fix the validation issues (US-027 AC-4). */
    'specs.fix': { input: z.object({ runId: z.string().min(1) }), output: SpecStart },
    /** Health check on demand (US-013 AC-1). */
    'capabilities.refresh': { input: z.object({}), output: Capabilities },
    /** Commit spec changes (US-023, FR-072): only spec/** and .specforge/** on the current branch. */
    'specCommit.commit': {
      input: z.object({
        projectId: z.string().min(1),
        paths: z.array(z.string().min(1)).min(1),
        message: z.string().trim().min(1).max(10_000),
      }),
      output: z.union([z.object({ ok: z.literal(true), commit: z.string() }), z.object({ ok: z.literal(false), output: z.string() })]),
    },
    /** Merge check on window focus and *Refresh* (US-024 AC-1). */
    'merge.check': { input: z.object({ projectId: z.string().min(1) }), output: z.object({ merged: z.array(z.string()) }) },
    /** Recovery of a failed or interrupted run (US-055): retry (fresh or reusing the branch), resume, discard. */
    'board.runAction': {
      input: z.object({
        projectId: z.string().min(1),
        storyId: z.string().min(1),
        action: z.enum(['retry', 'resume', 'discard']),
        reuseBranch: z.boolean().optional(),
        removeWorktree: z.boolean().optional(),
      }),
      output: MoveOutcome,
    },
    /** Open a file of the story's run in the OS default editor (US-057 AC-3). */
    'review.openFile': {
      input: z.object({ projectId: z.string().min(1), runId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ ok: z.literal(true) }),
    },
    /** AI quality check of an artifact (US-029): read-only `quality_check` run. */
    'quality.check': { input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }), output: SpecStart },
    /** *Apply fix*: a refine proposal of the finding's artifact / section. */
    'quality.applyFix': { input: z.object({ findingId: z.string().min(1) }), output: SpecStart },
    'quality.dismiss': { input: z.object({ findingId: z.string().min(1), reason: z.string().max(2000) }), output: SpecDecision },
    /** Creates `spec/01_intent/intent.md` from the template (US-028 AC-1); refused if it exists. */
    'intent.create': { input: z.object({ projectId: z.string().min(1) }), output: z.object({ path: z.string() }) },
    /** *Analyse intent* (US-028 AC-2): a read-only clarify run. */
    'clarify.start': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }),
      output: z.union([
        z.object({ ok: z.literal(true), clarificationId: z.string() }),
        z.object({ ok: z.literal(false), reason: z.string() }),
      ]),
    },
    'clarify.answer': { input: z.object({ clarificationId: z.string().min(1), answers: Answers }), output: SpecDecision },
    'clarify.saveDraft': { input: z.object({ clarificationId: z.string().min(1), answers: Answers }), output: SpecDecision },
    'clarify.finish': { input: z.object({ clarificationId: z.string().min(1) }), output: SpecStart },
    'clarify.cancel': { input: z.object({ clarificationId: z.string().min(1) }), output: SpecDecision },
    /** Approve a story in Review (US-058 AC-1): Done; returns the merge instructions (SpecForge never merges). */
    'review.approve': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.union([
        z.object({
          ok: z.literal(true),
          merge: z.object({ baseBranch: z.string().nullable(), order: z.array(z.object({ storyId: z.string(), branch: z.string() })) }),
        }),
        z.object({ ok: z.literal(false), reason: z.string() }),
      ]),
    },
    /** Reject (US-058 AC-2): back to Ready; git: branch marked rejected; non-git: optional restore of the run's files. */
    'review.reject': {
      input: z.object({
        projectId: z.string().min(1),
        storyId: z.string().min(1),
        reason: z.string().max(2000).optional(),
        restoreSnapshot: z.boolean().optional(),
      }),
      output: MoveOutcome,
    },
    /** Request corrections (US-059): back to In Progress; resumes the agent session unless `fresh`. */
    'review.requestCorrections': {
      input: z.object({
        projectId: z.string().min(1),
        storyId: z.string().min(1),
        feedback: z.string().trim().min(1).max(20_000),
        fresh: z.boolean().optional(),
      }),
      output: MoveOutcome,
    },
    /** Epic management (US-035): create, merge, split, reorder, delete (stories → No epic), approve all. */
    'epics.create': {
      input: z.object({ projectId: z.string().min(1), title: z.string().trim().min(1).max(200) }),
      output: z.object({ id: z.string(), path: z.string() }),
    },
    'epics.merge': {
      input: z.object({ projectId: z.string().min(1), sourceId: z.string().min(1), targetId: z.string().min(1) }),
      output: z.object({}),
    },
    'epics.split': {
      input: z.object({
        projectId: z.string().min(1),
        epicId: z.string().min(1),
        storyIds: z.array(z.string()).min(1),
        title: z.string().trim().min(1).max(200),
      }),
      output: z.object({ id: z.string(), path: z.string() }),
    },
    'epics.reorder': { input: z.object({ projectId: z.string().min(1), epicIds: z.array(z.string()) }), output: z.object({}) },
    'epics.delete': { input: z.object({ projectId: z.string().min(1), epicId: z.string().min(1) }), output: z.object({}) },
    'epics.approveAll': { input: z.object({ projectId: z.string().min(1) }), output: z.object({ approved: z.array(z.string()) }) },
    /** Moves a story to another epic lane (US-039 AC-3); null = No epic. */
    'stories.setEpic': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1), epicId: z.string().min(1).nullable() }),
      output: z.object({}),
    },
    /** Read-only project chat (US-062). */
    'chat.createThread': {
      input: z.object({ projectId: z.string().min(1), title: z.string().max(200) }),
      output: z.object({ id: z.string(), title: z.string() }),
    },
    'chat.send': { input: z.object({ threadId: z.string().min(1), text: z.string().trim().min(1).max(20_000) }), output: SpecStart },
    'runs.cancel': {
      input: z.object({ runId: z.string().min(1) }),
      output: z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]),
    },
    /** Confirmed close with active runs: they are stopped and marked Interrupted (US-049 AC-2). */
    'runs.interruptAll': {
      input: z.object({}),
      output: z.object({}),
    },
    'board.move': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1), to: BoardStatus, beforeStoryId: z.string().nullable() }),
      output: MoveOutcome,
    },
    'projects.rename': {
      input: z.object({ projectId: z.string().min(1), name: z.string() }),
      output: z.object({}),
    },
    'projects.remove': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({}),
    },
    'projects.locate': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({}),
    },
    'rules.setGlobalDisabled': {
      input: z.object({ projectId: z.string().min(1), ruleId: z.string().min(1), disabled: z.boolean() }),
      output: z.object({}),
    },
    'stories.addDependency': {
      input: z.object({
        projectId: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        type: DependencyType,
        rationale: z.string().optional(),
      }),
      output: DependencyChange,
    },
    'stories.removeDependency': {
      input: z.object({ projectId: z.string().min(1), from: z.string().min(1), to: z.string().min(1), type: DependencyType }),
      output: DependencyChange,
    },
  },
  queries: {
    'system.info': {
      input: z.object({}),
      output: z.object({ contractVersion: z.string(), platform: z.string() }),
    },
    'projects.gitAvailable': {
      input: z.object({}),
      output: z.object({ available: z.boolean() }),
    },
    // US-068: what a picked folder holds (SpecForge project, empty, or other content);
    // US-079: other content also reports its Git state and a suggested specification folder.
    'projects.inspectFolder': {
      input: z.object({ path: z.string().min(1) }),
      output: z.object({
        kind: z.enum(['project', 'empty', 'notEmpty']),
        git: z.enum(['none', 'root', 'subfolder']).optional(),
        suggestedSpecRoot: z.string().optional(),
      }),
    },
    // US-079 AC-3: why a specification folder cannot be used for adopting `path` (null: valid).
    'projects.checkSpecRoot': {
      input: z.object({ path: z.string().min(1), specRoot: z.string() }),
      output: z.object({ problem: z.string().nullable() }),
    },
    'artifacts.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({
          kind: z.string(),
          label: z.string(),
          artifacts: z.array(
            z.object({
              path: z.string(),
              approval: z.enum(['draft', 'approved']),
              invalid: z.string().nullable(),
              impacted: z.boolean().optional(),
            }),
          ),
        }),
      ),
    },
    'artifacts.generationCheck': {
      input: z.object({ projectId: z.string().min(1), target: z.enum(['requirements', 'design', 'epics', 'stories', 'test_concepts']) }),
      output: z.object({ drafts: z.array(z.string()), warning: z.string().nullable() }),
    },
    'artifact.read': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ content: z.string(), hash: z.string() }),
    },
    'settings.get': {
      input: z.object({ projectId: z.string().nullable() }),
      output: z.object({
        global: AgentSettingsView,
        project: AgentSettingsView.nullable(),
        effective: AgentSettingsView,
        exec: ExecDefaults,
        /** Models reported by the runtime's capabilities (empty until an adapter reports them). */
        modelSuggestions: z.array(z.string()),
      }),
    },
    'specs.review': { input: z.object({ runId: z.string().min(1) }), output: SpecReview.nullable() },
    /** The running or undecided codebase analysis (US-080). */
    'specs.openAnalysis': { input: z.object({ projectId: z.string().min(1) }), output: SpecReview.nullable() },
    /** US-080 AC-1: the workspace holds code besides the specifications (offers *Analyse codebase*). */
    'specs.analysisAvailable': { input: z.object({ projectId: z.string().min(1) }), output: z.object({ available: z.boolean() }) },
    /** The running or not yet decided specification run of a target (to resume the review). */
    'specs.openReview': {
      input: z.object({ projectId: z.string().min(1), target: z.enum(['requirements', 'design', 'epics', 'stories', 'test_concepts']) }),
      output: SpecReview.nullable(),
    },
    'capabilities.get': { input: z.object({}), output: Capabilities },
    'specCommit.status': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({ files: z.array(z.object({ path: z.string(), change: z.enum(['A', 'M', 'D']) })), message: z.string() }),
    },
    'specCommit.diff': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ patch: z.string() }),
    },
    /** What the recovery actions of a stopped story offer (US-055 AC-1). */
    'runs.recovery': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.object({ lastRunId: z.string().nullable(), resumable: z.boolean(), gitMode: z.boolean(), hasWorktree: z.boolean() }),
    },
    /** Review of a story (US-057 AC-1/AC-2): latest run with its result, computed changes and overlap warnings. */
    'review.get': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.object({
        runId: z.string().nullable(),
        overlaps: z.array(z.object({ storyId: z.string(), files: z.array(z.string()) })),
        gitMode: z.boolean(),
      }),
    },
    /** Before/after contents of one changed file (vs. the run's base commit or snapshot). */
    'review.fileVersions': {
      input: z.object({ projectId: z.string().min(1), runId: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ before: z.string().nullable(), after: z.string().nullable(), binary: z.boolean() }),
    },
    /** Permission log of a run (US-057 AC-3, US-052 AC-3). */
    'runs.permissions': {
      input: z.object({ runId: z.string().min(1) }),
      output: z.array(
        z.object({
          id: z.string(),
          toolName: z.string(),
          input: z.record(z.string(), z.unknown()),
          outsideWorkspace: z.boolean(),
          requestedAt: z.string(),
          decision: z.enum(['allow', 'deny']).nullable(),
          decidedBy: z.string().nullable(),
          message: z.string().nullable(),
        }),
      ),
    },
    'quality.findings': {
      input: z.object({ projectId: z.string().min(1), path: z.string().min(1).optional() }),
      output: z.array(
        z.object({
          id: z.string(),
          artifactPath: z.string(),
          elementId: z.string().nullable(),
          severity: z.enum(['critical', 'major', 'minor', 'info']),
          category: z.string(),
          explanation: z.string(),
          suggestedFix: z.string(),
          state: z.enum(['open', 'applied', 'dismissed']),
          dismissReason: z.string().nullable(),
          fixRunId: z.string().nullable(),
        }),
      ),
    },
    /** Phase stepper (US-033): status, loop step and availability per phase; the recommended phase; soft-gate inputs. */
    'phases.status': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        phases: z.array(
          z.object({
            phase: z.enum(['intent', 'requirements', 'design', 'stories', 'kanban']),
            state: z.enum(['not_started', 'in_progress', 'awaiting_approval', 'approved', 'impacted']),
            step: z.enum(['write', 'quality_check', 'review', 'approve']),
            enabled: z.boolean(),
            unapprovedInputs: z.array(z.string()),
          }),
        ),
        recommended: z.enum(['intent', 'requirements', 'design', 'stories', 'kanban']),
        /** US-084 AC-4: all initial epics are Done. */
        maintenance: z.boolean(),
      }),
    },
    'clarify.current': { input: z.object({ projectId: z.string().min(1), path: z.string().min(1) }), output: Clarification.nullable() },
    /** Whether corrections can resume the agent session of the story's last run (US-059). */
    'review.correctionOptions': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.object({ resumable: z.boolean(), reason: z.string().nullable() }),
    },
    'review.rejectedBranches': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.array(z.string()),
    },
    /** Traceability (US-034): upstream and downstream links of an element, story, run or changed file. */
    'trace.get': {
      input: z.object({
        projectId: z.string().min(1),
        target: z.object({ kind: z.enum(['element', 'run', 'file']), id: z.string().min(1) }),
      }),
      output: z.object({ node: TraceNode, upstream: z.array(TraceNode), downstream: z.array(TraceNode), issues: z.array(z.string()) }),
    },
    /** Links to unknown IDs in all artifacts (US-034 AC-3). */
    'trace.issues': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(z.object({ path: z.string(), message: z.string() })),
    },
    'epics.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        epics: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            approval: z.enum(['draft', 'approved']),
            path: z.string(),
            stories: z.array(z.string()),
            requirements: z.array(z.string()),
          }),
        ),
        /** Must-have requirements not covered by any epic (coverage strip, US-035 AC-2). */
        uncovered: z.array(z.string()),
      }),
    },
    /** Feature intents with their derived lifecycle (US-081, FR-104). */
    /** Potentially impacted elements and stories (US-086, FR-017/FR-071); orphaned = the ID no longer exists. */
    'impact.flags': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({
          elementId: z.string(),
          sourceRef: z.string(),
          reason: z.string(),
          flaggedAt: z.string(),
          path: z.string().nullable(),
          orphaned: z.boolean(),
        }),
      ),
    },
    'impact.view': { input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }), output: ImpactView },
    /** US-091: pending correction feedback from *Apply in corrections*. */
    'inflight.feedback': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.object({ feedback: z.string().nullable() }),
    },
    'delta.changeSet': {
      input: z.object({
        projectId: z.string().min(1),
        featureId: z.string().min(1),
        phase: z.enum(['requirements', 'design', 'stories']),
      }),
      output: ChangeSetView.nullable(),
    },
    'baselines.offer': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        available: z.boolean(),
        reason: z.string().nullable(),
        uncommitted: z.array(z.string()),
        nextTag: z.string(),
        features: z.array(z.object({ id: z.string(), title: z.string() })),
        epics: z.array(z.object({ id: z.string(), title: z.string() })),
      }),
    },
    'baselines.list': { input: z.object({ projectId: z.string().min(1) }), output: z.array(Baseline) },
    /** US-096 AC-3: the file at the baseline and now. */
    'baselines.compare': {
      input: z.object({ projectId: z.string().min(1), tag: z.string().min(1), path: z.string().min(1) }),
      output: z.object({ before: z.string().nullable(), after: z.string().nullable() }),
    },
    'ideas.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({ ideas: z.array(Idea), untriaged: z.number().int().nonnegative() }),
    },
    'delta.epicProposal': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }),
      output: EpicProposal,
    },
    'features.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(FeatureView),
    },
    'features.wizard.get': { input: z.object({ wizardId: z.string().min(1) }), output: FeatureWizard.nullable() },
    'features.wizard.drafts': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(z.object({ id: z.string(), title: z.string(), step: WizardStep, updatedAt: z.string() })),
    },
    'features.wizard.preview': {
      input: z.object({ wizardId: z.string().min(1), title: z.string().optional() }),
      output: z.object({ featureId: z.string(), title: z.string(), path: z.string(), content: z.string() }),
    },
    'features.get': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }),
      output: FeatureView.extend({
        links: z.array(z.object({ id: z.string(), type: z.string() })),
        impact: ImpactView.nullable(),
        /** US-091: in-flight decisions of the feature. */
        decisions: z.array(
          z.object({ storyId: z.string(), decision: z.enum(['continue', 'cancel', 'apply_in_corrections']), decidedAt: z.string() }),
        ),
        /** Status changes (US-094 AC-3), newest first. */
        events: z
          .array(
            z.object({
              projectId: z.string(),
              featureId: z.string(),
              status: z.enum(['draft', 'approved', 'in_delivery', 'done', 'withdrawn']),
              note: z.string().nullable(),
              at: z.string(),
            }),
          )
          .optional(),
      }).nullable(),
    },
    /** US-094 AC-2: what *Withdraw* would discard, keep and ask about. */
    'features.withdrawPreview': {
      input: z.object({ projectId: z.string().min(1), featureId: z.string().min(1) }),
      output: z.object({
        openChangeSets: z.array(z.string()),
        appliedChanges: z.array(z.string()),
        notStartedStories: z.array(z.string()),
        blockedBy: z.string().nullable(),
      }),
    },
    /** Dashboard (US-061): statistics, runs, decisions, activity, artifacts per phase and epics. */
    'dashboard.get': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        storyCounts: z.record(BoardStatus, z.number().int()),
        progress: z.object({ done: z.number().int(), total: z.number().int() }),
        runs: z.object({ active: z.number().int(), queued: z.number().int() }),
        pendingDecisions: z.number().int(),
        unmerged: z.number().int(),
        /** Runs and feature status changes (US-094 AC-3); `runId` is null for feature events. */
        activity: z.array(
          z.object({
            runId: z.string().nullable(),
            storyId: z.string().nullable(),
            featureId: z.string().optional(),
            label: z.string(),
            at: z.string(),
          }),
        ),
        artifacts: z.array(
          z.object({
            phase: z.enum(['intent', 'requirements', 'design', 'stories']),
            items: z.array(z.object({ path: z.string(), approval: z.enum(['draft', 'approved']), impacted: z.boolean() })),
          }),
        ),
        epics: z.array(
          z.object({
            epicId: z.string(),
            title: z.string(),
            status: z.enum(['not_started', 'in_progress', 'ready_for_review', 'done', 'merged']),
            progress: z.object({ done: z.number(), total: z.number(), doneWeight: z.number(), totalWeight: z.number() }),
          }),
        ),
        kanbanEnabled: z.boolean(),
      }),
    },
    'chat.threads': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(z.object({ id: z.string(), title: z.string(), updatedAt: z.string(), active: z.boolean() })),
    },
    'chat.messages': { input: z.object({ threadId: z.string().min(1) }), output: z.array(ChatMessageView) },
    'runs.active': {
      input: z.object({}),
      output: z.array(z.object({ runId: z.string(), projectId: z.string(), storyId: z.string(), title: z.string() })),
    },
    'runs.context': {
      input: z.object({ runId: z.string().min(1) }),
      output: z.object({ context: z.string().nullable() }),
    },
    'runs.result': {
      input: z.object({ runId: z.string().min(1) }),
      output: z
        .object({
          result: z
            .object({
              outcome: z.enum(['success', 'partial', 'failed']),
              summary: z.string(),
              tests: z.object({ run: z.number(), passed: z.number(), failed: z.number() }).optional(),
              coverage: z.number().optional(),
              changedFiles: z.array(z.string()),
              openIssues: z.array(z.string()),
              recommendations: z.array(z.object({ type: z.string(), text: z.string() })),
            })
            .nullable(),
          unavailableReason: z.string().nullable(),
          computedFiles: z.array(
            z.object({ path: z.string(), change: z.enum(['A', 'M', 'D']), additions: z.number(), deletions: z.number() }),
          ),
        })
        .nullable(),
    },
    'runs.events': {
      input: z.object({
        runId: z.string().min(1),
        afterSeq: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(10_000).optional(),
      }),
      output: z.array(z.object({ seq: z.number().int(), ts: z.string(), type: z.string(), payload: z.unknown() })),
    },
    /** Full-text search in a run's log (US-054 AC-3, NFR-005): matching event sequence numbers. */
    'runs.search': {
      input: z.object({ runId: z.string().min(1), query: z.string().max(500) }),
      output: z.object({ seqs: z.array(z.number().int()), total: z.number().int().nonnegative() }),
    },
    /** Execution view (US-054 AC-1): active runs, queued stories, recent runs. */
    'runs.overview': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({
          runId: z.string().nullable(),
          storyId: z.string().nullable(),
          title: z.string(),
          kind: z.string(),
          status: z.string(),
          queuedAt: z.string().nullable(),
          startedAt: z.string().nullable(),
          endedAt: z.string().nullable(),
          touchedFiles: z.number().int().nonnegative(),
          pendingPrompts: z.number().int().nonnegative(),
        }),
      ),
    },
    'runs.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({
          id: z.string(),
          storyId: z.string().nullable(),
          kind: z.string(),
          status: z.string(),
          startTrigger: z.string().nullable(),
          failureReason: z.string().nullable(),
          configSnapshot: z.unknown(),
          createdAt: z.string(),
          endedAt: z.string().nullable(),
        }),
      ),
    },
    'setup.state': {
      input: z.object({}),
      output: z.object({
        setupState: z.enum(['not_started', 'incomplete', 'complete']),
        steps: z.array(
          z.object({ id: SetupStepId, label: z.string(), status: z.enum(['ok', 'warning', 'missing', 'skipped']), detail: z.string() }),
        ),
      }),
    },
    'setup.ruleSuggestions': {
      input: z.object({}),
      output: z.array(z.object({ key: z.string(), label: z.string(), enabled: z.boolean() })),
    },
    'projectSettings.get': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        settings: ProjectSettings,
        vcsMode: z.enum(['git', 'none']),
        effectiveConcurrency: z.number().int(),
        concurrencyNote: z.string().nullable(),
        instructions: z.object({ content: z.string(), hash: z.string().nullable() }),
      }),
    },
    'pending.list': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({ storyId: z.string().nullable(), runId: z.string().optional(), title: z.string(), items: z.array(PendingItem) }),
      ),
    },
    'board.get': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.object({
        columns: z.array(
          z.object({
            status: BoardStatus,
            cards: z.array(
              z.object({
                storyId: z.string(),
                title: z.string(),
                size: z.string().nullable(),
                approval: z.enum(['draft', 'approved']),
                status: BoardStatus,
                subState: ExecSubState,
                queueReason: z.enum(['dependency', 'slot', 'workspace', 'conflict']).nullable(),
                waitingFor: z.array(z.string()),
                statusNotice: z.string().nullable(),
                dependsOn: z.array(z.string()),
                related: z.array(z.string()),
                /** Epic of the story (US-039); null = No epic. */
                epicId: z.string().nullable().optional(),
                /** Potentially impacted flag (US-086). */
                impact: z.object({ sourceRef: z.string(), reason: z.string() }).nullable().optional(),
                /** Latest in-flight decision (US-091). */
                inFlight: z
                  .object({ decision: z.enum(['continue', 'cancel', 'apply_in_corrections']), featureId: z.string() })
                  .nullable()
                  .optional(),
                /** Done stories this rework story changes (US-092). */
                reworks: z.array(z.string()).optional(),
                /** Stories reworking this Done story: "Reworked by US-xxx" (US-092 AC-2). */
                reworkedBy: z.array(z.string()).optional(),
              }),
            ),
          }),
        ),
        /** Swimlanes by epic (US-039): lane order, derived status, progress, colour; empty without epics. */
        lanes: z
          .array(
            z.object({
              epicId: z.string().nullable(),
              title: z.string(),
              status: z.enum(['not_started', 'in_progress', 'ready_for_review', 'done', 'merged']),
              progress: z.object({ done: z.number(), total: z.number(), doneWeight: z.number(), totalWeight: z.number() }),
              colour: z.number().int().nullable(),
            }),
          )
          .optional(),
        queue: z.array(z.string()),
        slots: z.object({ active: z.number().int().nonnegative(), limit: z.number().int().nonnegative() }),
      }),
    },
    'projects.recent': {
      input: z.object({}),
      output: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          path: z.string(),
          lastOpenedAt: z.string().nullable(),
          phase: z
            .object({
              phase: z.enum(['intent', 'requirements', 'design', 'stories', 'kanban']),
              state: z.enum(['not_started', 'in_progress', 'awaiting_approval', 'approved', 'impacted']),
            })
            .nullable(),
          phaseLabel: z.string().nullable(),
          missing: z.boolean(),
        }),
      ),
    },
    'rules.effective': {
      input: z.object({ projectId: z.string().min(1) }),
      output: z.array(
        z.object({
          id: z.string(),
          effect: z.enum(['allow', 'deny']),
          toolName: z.string(),
          pattern: z.string().nullable(),
          appliesTo: z.enum(['implementation', 'chat', 'spec', 'all']),
          origin: z.enum(['global', 'project']),
          disabled: z.boolean(),
        }),
      ),
    },
    'stories.dependencies': {
      input: z.object({ projectId: z.string().min(1), storyId: z.string().min(1) }),
      output: z.object({
        dependencies: z.array(z.object({ to: z.string(), type: DependencyType })),
        storyIds: z.array(z.string()),
      }),
    },
    'shell.state': {
      input: z.object({}),
      output: z.object({
        projects: z.array(z.object({ id: z.string(), name: z.string() })),
        currentProjectId: z.string().nullable(),
        /** Specification root of the open project (US-078); null without an open project. */
        specRoot: z.string().nullable().optional(),
        vcs: Vcs.nullable(),
        runs: z.object({ running: z.number().int().nonnegative(), queued: z.number().int().nonnegative() }),
        pendingDecisions: z.number().int().nonnegative(),
        storyCount: z.number().int().nonnegative(),
        /** Recommended next action (US-060, ADR-017); null without an open project. */
        nextStep: z
          .object({
            code: z.string(),
            label: z.string(),
            reason: z.string(),
            target: z.object({
              area: z.string(),
              storyId: z.string().optional(),
              generate: z.string().optional(),
              featureId: z.string().optional(),
            }),
          })
          .nullable()
          .optional(),
      }),
    },
  },
  events: {
    'run.output': z.object({ runId: z.string(), seq: z.number().int().nonnegative(), text: z.string() }),
    'run.finished': z.object({
      projectId: z.string(),
      runId: z.string(),
      storyId: z.string(),
      outcome: z.enum(['completed', 'failed', 'cancelled']),
      /** OS notification wanted (execution defaults). */
      notify: z.boolean(),
    }),
    'permission.requested': z.object({
      projectId: z.string(),
      id: z.string(),
      storyId: z.string().nullable(),
      toolName: z.string(),
      notify: z.boolean(),
    }),
    'pending.changed': z.object({ projectId: z.string() }),
    /** Project state relevant to the dashboard changed (board, index, runs, reviews; US-060 AC-3). */
    'project.changed': z.object({ projectId: z.string() }),
    /** A chat thread got a new message (US-062). */
    'chat.message': z.object({ projectId: z.string(), threadId: z.string() }),
    /** A clarification dialogue changed (new items, failure, cancel; US-028). */
    'clarify.updated': z.object({ projectId: z.string(), clarificationId: z.string(), state: z.string() }),
    /** A quality check ended (US-029): findings were stored or the run failed. */
    'quality.checked': z.object({ projectId: z.string(), path: z.string(), runId: z.string() }),
    /** Capabilities changed (US-013): AI actions become enabled or disabled. */
    'capabilities.changed': Capabilities,
    /** A specification run ended; its changes await Keep / Discard (US-027). */
    'spec.reviewReady': z.object({ projectId: z.string(), runId: z.string(), state: z.string() }),
    /** A delta change set of a feature changed (US-089). */
    'features.deltaUpdated': z.object({ projectId: z.string(), featureId: z.string() }),
    /** The impact list of a feature changed (agent items, US-088). */
    'features.impactUpdated': z.object({ projectId: z.string(), featureId: z.string() }),
    /** A feature wizard draft changed (AI review finished, US-083). */
    'features.wizardUpdated': z.object({ projectId: z.string(), wizardId: z.string() }),
  },
} as const;

type Contract = typeof CONTRACT;
export type CommandName = keyof Contract['commands'];
export type QueryName = keyof Contract['queries'];
export type EventName = keyof Contract['events'];
export type OperationName = CommandName | QueryName;

export type CommandInput<N extends CommandName> = z.infer<Contract['commands'][N]['input']>;
export type CommandOutput<N extends CommandName> = z.infer<Contract['commands'][N]['output']>;
export type QueryInput<N extends QueryName> = z.infer<Contract['queries'][N]['input']>;
export type QueryOutput<N extends QueryName> = z.infer<Contract['queries'][N]['output']>;
export type EventPayload<N extends EventName> = z.infer<Contract['events'][N]>;

/** Core-side implementation of commands and queries; operations without a handler answer NOT_IMPLEMENTED. */
export type ContractHandlers = Partial<AllHandlers>;

type AllHandlers = { [N in CommandName]: (input: CommandInput<N>) => Promise<CommandOutput<N>> } & {
  [N in QueryName]: (input: QueryInput<N>) => Promise<QueryOutput<N>>;
};
