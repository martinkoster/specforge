// SPDX-License-Identifier: Apache-2.0
// Layering rules (ADR-003, NFR-021). Checked by `pnpm check:layering` as part of `pnpm build`.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'The domain package is framework-free and must not depend on any other SpecForge package.',
      severity: 'error',
      from: { path: '(^|/)packages/domain/' },
      to: { path: '(^|/)packages/(?!domain/)' },
    },
    {
      name: 'application-not-to-adapters-or-ui',
      comment: 'Application services depend on ports only, never on adapters, UI, Electron main or the core composition root.',
      severity: 'error',
      from: { path: '(^|/)packages/application/' },
      to: { path: '(^|/)packages/(adapters|ui|main|core)/' },
    },
    {
      name: 'agent-sdk-only-in-claude-adapter',
      comment:
        'Vendor neutrality (CON-003, NFR-022): only the Claude Code adapter package may use the Claude Agent SDK; everything else talks to the AgentAdapter port.',
      severity: 'error',
      from: { pathNot: '(^|/)packages/adapters/agent-claude-code/' },
      to: { path: '(^|/)@anthropic-ai/claude-agent-sdk(/|$)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
  },
};
