// SPDX-License-Identifier: Apache-2.0
// Effective approval rules of a project with their origin; global rules can be disabled per project (US-014 AC-3, FR-048).
import type { QueryOutput } from '@specforge/ipc-contract';

export type EffectiveRuleRow = QueryOutput<'rules.effective'>[number];

export interface EffectiveRulesProps {
  rules: readonly EffectiveRuleRow[];
  onToggleGlobal(ruleId: string, disabled: boolean): void;
}

const capitalize = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

function ruleName(rule: EffectiveRuleRow): string {
  return [capitalize(rule.effect), rule.toolName, rule.pattern].filter(Boolean).join(' ');
}

export function EffectiveRules({ rules, onToggleGlobal }: EffectiveRulesProps) {
  if (rules.length === 0) return <p>No approval rules — every agent request is relayed to you.</p>;
  return (
    <table aria-label="Effective approval rules">
      <thead>
        <tr>
          <th scope="col">Effect</th>
          <th scope="col">Tool</th>
          <th scope="col">Pattern</th>
          <th scope="col">Applies to</th>
          <th scope="col">Origin</th>
          <th scope="col">State</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id}>
            <td>{capitalize(rule.effect)}</td>
            <td>{rule.toolName}</td>
            <td>{rule.pattern ?? 'any input'}</td>
            <td>{rule.appliesTo === 'all' ? 'all runs' : `${rule.appliesTo} runs`}</td>
            <td>{capitalize(rule.origin)}</td>
            <td>
              {rule.origin === 'global' ? (
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Use global rule ${ruleName(rule)} in this project`}
                    checked={!rule.disabled}
                    onChange={() => onToggleGlobal(rule.id, !rule.disabled)}
                  />
                  {rule.disabled ? 'Disabled for this project' : 'Active'}
                </label>
              ) : (
                'Active'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
