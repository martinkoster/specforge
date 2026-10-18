// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { detectProjectCommands, enableSuggestion, suggestRules } from '../src/index.js';

const fs = (files: Record<string, string>) => ({
  exists: (p: string) => p in files,
  read: (p: string) => files[p],
});

describe('US-014 AC-2: suggested rules, unticked, from detected project commands', () => {
  it('detects npm/pnpm/yarn scripts, pytest, Maven, Gradle, Go and Cargo', () => {
    expect(
      detectProjectCommands(fs({ 'package.json': JSON.stringify({ scripts: { test: 'vitest', build: 'tsc', lint: 'eslint .' } }) })),
    ).toEqual(['npm test', 'npm run build', 'npm run lint']);
    expect(detectProjectCommands(fs({ 'package.json': JSON.stringify({ scripts: { test: 'x' } }), 'pnpm-lock.yaml': '' }))).toEqual([
      'pnpm test',
    ]);
    expect(detectProjectCommands(fs({ 'package.json': JSON.stringify({ scripts: { build: 'x' } }), 'yarn.lock': '' }))).toEqual([
      'yarn build',
    ]);
    expect(detectProjectCommands(fs({ 'pyproject.toml': '' }))).toEqual(['pytest']);
    expect(detectProjectCommands(fs({ 'pom.xml': '' }))).toEqual(['mvn test', 'mvn package']);
    expect(detectProjectCommands(fs({ 'build.gradle.kts': '', gradlew: '' }))).toEqual(['./gradlew test', './gradlew build']);
    expect(detectProjectCommands(fs({ 'build.gradle': '' }))).toEqual(['gradle test', 'gradle build']);
    expect(detectProjectCommands(fs({ 'go.mod': '' }))).toEqual(['go test ./...', 'go build ./...']);
    expect(detectProjectCommands(fs({ 'Cargo.toml': '' }))).toEqual(['cargo test', 'cargo build']);
    expect(detectProjectCommands(fs({ 'package.json': 'not json' }))).toEqual([]);
  });

  it('offers read/search, edit-in-workspace and per-command rules for both Bash and PowerShell, all unticked', () => {
    const suggestions = suggestRules(['npm test']);

    expect(suggestions.map((s) => s.key)).toEqual(['read-search', 'edit-in-workspace', 'command:npm test']);
    expect(suggestions.every((s) => s.enabled === false)).toBe(true);
    expect(suggestions[0]!.rules.map((r) => r.toolName)).toEqual(['Read', 'Glob', 'Grep']);
    expect(suggestions[1]!.rules.every((r) => r.appliesTo === 'implementation' && r.effect === 'allow')).toBe(true);
    expect(suggestions[2]!.rules).toEqual([
      { effect: 'allow', toolName: 'Bash', pattern: 'npm test', appliesTo: 'implementation' },
      { effect: 'allow', toolName: 'PowerShell', pattern: 'npm test', appliesTo: 'implementation' },
    ]);
  });

  it('creates global or project rules when a suggestion is enabled', () => {
    const [readSearch] = suggestRules([]);

    const globalRules = enableSuggestion(readSearch!, { scope: 'global' });
    const projectRules = enableSuggestion(readSearch!, { scope: 'project', projectId: 'P' });

    expect(globalRules).toHaveLength(3);
    expect(globalRules.every((r) => r.scope === 'global' && r.createdFrom === 'suggestion' && r.projectId === undefined)).toBe(true);
    expect(projectRules.every((r) => r.scope === 'project' && r.projectId === 'P')).toBe(true);
  });
});
