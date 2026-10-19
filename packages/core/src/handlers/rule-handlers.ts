// SPDX-License-Identifier: Apache-2.0
// Approval rules on the IPC contract (US-014 AC-3): effective rules with origin; projects can disable global rules.
import type { EffectiveRule } from '@specforge/domain';
import type { ContractHandlers } from '@specforge/ipc-contract';

export interface RuleHandlerDeps {
  rules: {
    effective(projectId: string): EffectiveRule[];
    setGlobalDisabled(projectId: string, ruleId: string, disabled: boolean): void;
  };
}

export function createRuleHandlers({ rules }: RuleHandlerDeps): ContractHandlers {
  return {
    'rules.effective': async ({ projectId }) =>
      rules.effective(projectId).map(({ rule, origin, disabled }) => ({
        id: rule.id,
        effect: rule.effect,
        toolName: rule.toolName,
        pattern: rule.pattern ?? null,
        appliesTo: rule.appliesTo,
        origin,
        disabled,
      })),
    'rules.setGlobalDisabled': async ({ projectId, ruleId, disabled }) => {
      rules.setGlobalDisabled(projectId, ruleId, disabled);
      return {};
    },
  };
}
