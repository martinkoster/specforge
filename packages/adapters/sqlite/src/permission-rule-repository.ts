// SPDX-License-Identifier: Apache-2.0
// Layered approval rules (ADR-019): global rules, project rules, and global rules disabled per project.
import { randomUUID } from 'node:crypto';
import { effectiveRules, type EffectiveRule, type PermissionRule } from '@specforge/domain';
import type { Database as Sqlite } from 'better-sqlite3';

interface RuleRow {
  id: string;
  scope: PermissionRule['scope'];
  project_id: string | null;
  effect: PermissionRule['effect'];
  tool_name: string;
  pattern: string | null;
  applies_to: PermissionRule['appliesTo'];
  created_from: PermissionRule['createdFrom'];
}

const toRule = (r: RuleRow): PermissionRule => ({
  id: r.id,
  scope: r.scope,
  projectId: r.project_id ?? undefined,
  effect: r.effect,
  toolName: r.tool_name,
  pattern: r.pattern ?? undefined,
  appliesTo: r.applies_to,
  createdFrom: r.created_from,
});

export class PermissionRuleRepository {
  constructor(private readonly sqlite: Sqlite) {}

  create(rule: Omit<PermissionRule, 'id'>): PermissionRule {
    if (rule.scope === 'project' && !rule.projectId) throw new Error('A project rule needs a project id.');
    if (rule.scope === 'global' && rule.projectId) throw new Error('A global rule must not have a project id.');
    const created: PermissionRule = { ...rule, id: randomUUID() };
    this.sqlite
      .prepare(
        `insert into permission_rule (id, scope, project_id, effect, tool_name, pattern, applies_to, created_from, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.scope,
        created.projectId ?? null,
        created.effect,
        created.toolName,
        created.pattern ?? null,
        created.appliesTo,
        created.createdFrom,
        new Date().toISOString(),
      );
    return created;
  }

  delete(id: string): void {
    this.sqlite.prepare('delete from permission_rule where id = ?').run(id);
  }

  setGlobalDisabled(projectId: string, ruleId: string, disabled: boolean): void {
    if (disabled)
      this.sqlite.prepare('insert or ignore into project_rule_override (project_id, rule_id) values (?, ?)').run(projectId, ruleId);
    else this.sqlite.prepare('delete from project_rule_override where project_id = ? and rule_id = ?').run(projectId, ruleId);
  }

  /** Global default rules (inherited by all projects, ADR-019). */
  globalRules(): PermissionRule[] {
    return (this.sqlite.prepare("select * from permission_rule where scope = 'global' order by created_at, id").all() as RuleRow[]).map(
      toRule,
    );
  }

  /** Effective rules for a project with origin and disabled flag (settings view, permission decisions). */
  effective(projectId: string): EffectiveRule[] {
    const rows = (scope: string, project: string | null) =>
      (
        this.sqlite
          .prepare(`select * from permission_rule where scope = ? and project_id is ? order by created_at, id`)
          .all(scope, project) as RuleRow[]
      ).map(toRule);
    const disabled = (
      this.sqlite.prepare('select rule_id from project_rule_override where project_id = ?').all(projectId) as Array<{ rule_id: string }>
    ).map((r) => r.rule_id);
    const projectRules = rows('project', projectId);
    return projectRules.length === 0 && !this.projectExists(projectId) ? [] : effectiveRules(rows('global', null), projectRules, disabled);
  }

  private projectExists(projectId: string): boolean {
    return this.sqlite.prepare('select 1 from project where id = ?').get(projectId) !== undefined;
  }
}
