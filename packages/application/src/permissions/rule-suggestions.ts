// SPDX-License-Identifier: Apache-2.0
// Suggested approval rules (FR-051, FR-073): offered unticked; enabling one creates global or project rules.
import { randomUUID } from 'node:crypto';
import type { PermissionRule } from '@specforge/domain';

export type RuleTemplate = Pick<PermissionRule, 'effect' | 'toolName' | 'appliesTo'> & { pattern?: string };

export interface RuleSuggestion {
  key: string;
  label: string;
  rules: RuleTemplate[];
  enabled: false;
}

export interface ProjectFiles {
  exists(path: string): boolean;
  read(path: string): string | undefined;
}

function packageManager(files: ProjectFiles): 'npm' | 'pnpm' | 'yarn' {
  if (files.exists('pnpm-lock.yaml')) return 'pnpm';
  if (files.exists('yarn.lock')) return 'yarn';
  return 'npm';
}

/** Detects common test/build commands of a project from its manifest files. */
export function detectProjectCommands(files: ProjectFiles): string[] {
  const commands: string[] = [];
  const manifest = files.read('package.json');
  if (manifest !== undefined) {
    try {
      const scripts = (JSON.parse(manifest) as { scripts?: Record<string, string> }).scripts ?? {};
      const pm = packageManager(files);
      for (const script of ['test', 'build', 'lint']) {
        if (!scripts[script]) continue;
        commands.push(pm === 'npm' && script !== 'test' ? `npm run ${script}` : `${pm} ${script}`);
      }
    } catch {
      // unreadable package.json: no suggestions from it
    }
  }
  if (files.exists('pyproject.toml') || files.exists('pytest.ini') || files.exists('setup.cfg')) commands.push('pytest');
  if (files.exists('pom.xml')) commands.push('mvn test', 'mvn package');
  if (files.exists('build.gradle') || files.exists('build.gradle.kts')) {
    const gradle = files.exists('gradlew') ? './gradlew' : 'gradle';
    commands.push(`${gradle} test`, `${gradle} build`);
  }
  if (files.exists('go.mod')) commands.push('go test ./...', 'go build ./...');
  if (files.exists('Cargo.toml')) commands.push('cargo test', 'cargo build');
  return commands;
}

/** Suggestions for the setup wizard and project settings; all start unticked. */
export function suggestRules(commands: readonly string[]): RuleSuggestion[] {
  return [
    {
      key: 'read-search',
      label: 'Read & search files',
      rules: ['Read', 'Glob', 'Grep'].map((toolName) => ({ effect: 'allow', toolName, appliesTo: 'all' })),
      enabled: false,
    },
    {
      key: 'edit-in-workspace',
      label: "Edit files inside the run's workspace",
      rules: ['Edit', 'Write', 'MultiEdit'].map((toolName) => ({ effect: 'allow', toolName, appliesTo: 'implementation' })),
      enabled: false,
    },
    ...commands.map((command): RuleSuggestion => ({
      key: `command:${command}`,
      label: `Run \`${command}\``,
      // Agents use Bash on macOS/Linux and may use PowerShell on Windows (spike S1).
      rules: ['Bash', 'PowerShell'].map((toolName) => ({ effect: 'allow', toolName, pattern: command, appliesTo: 'implementation' })),
      enabled: false,
    })),
  ];
}

export function enableSuggestion(
  suggestion: RuleSuggestion,
  target: { scope: 'global' } | { scope: 'project'; projectId: string },
): PermissionRule[] {
  return suggestion.rules.map((template) => ({
    ...template,
    id: randomUUID(),
    scope: target.scope,
    ...(target.scope === 'project' ? { projectId: target.projectId } : {}),
    createdFrom: 'suggestion',
  }));
}
