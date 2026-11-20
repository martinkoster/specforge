// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupChecked } from './styled-controls.js';
import type { ContractHandlers, QueryOutput } from '@specforge/ipc-contract';
import { ChatPanel } from '../src/dashboard/ChatPanel.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(async () => {
  cleanupChecked();
  closeFakeCores();
});

type Message = QueryOutput<'chat.messages'>[number];
const msg = (over: Partial<Message>): Message => ({
  id: 'm',
  role: 'user',
  content: '',
  runId: null,
  toolUses: [],
  recommendations: [],
  error: false,
  createdAt: '2026-10-16T10:00:00.000Z',
  ...over,
});

async function renderChat(handlers: ContractHandlers = {}, aiDisabledReason: string | null = null) {
  const core = await fakeCoreWithEvents({
    'chat.threads': async () => [{ id: 't1', title: 'Planning', updatedAt: '2026-10-16T10:00:00.000Z', active: false }],
    'chat.messages': async () => [
      msg({ id: 'm1', content: 'What next?' }),
      msg({
        id: 'm2',
        role: 'assistant',
        content: 'Start US-002.',
        runId: 'r1',
        toolUses: ['Grep {"pattern":"US-"}', 'Read {"file_path":"spec/x.md"}'],
        recommendations: [{ type: 'start_story', storyId: 'US-002', text: 'Move US-002 to In Progress' }],
      }),
    ],
    ...handlers,
  });
  render(<ChatPanel session={core.session} projectId="p1" aiDisabledReason={aiDisabledReason} />);
  await userEvent.click(screen.getByText('Project chat'));
  return core;
}

describe('US-062 AC-1: chat panel', () => {
  it('lists threads; shows messages with collapsed tool uses and recommendation cards (AC-3)', async () => {
    await renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(await within(log).findByText('Start US-002.')).toBeInTheDocument();
    expect(within(log).getByText('2 tool uses')).toBeInTheDocument();
    const card = within(log).getByRole('note');
    expect(card).toHaveTextContent('Recommendation: Move US-002 to In Progress');
    expect(card).toHaveTextContent('SpecForge does not do this for you');
  });

  it('creates a thread and streams the answer as it arrives', async () => {
    const create = vi.fn(async () => ({ id: 't2', title: 'New thread' }));
    const send = vi.fn(async () => ({ ok: true as const, runId: 'r9' }));
    const { server } = await renderChat({ 'chat.createThread': create, 'chat.send': send, 'chat.messages': async () => [] });
    await userEvent.click(screen.getByRole('button', { name: 'New thread' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Hello?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't2', text: 'Hello?' }));

    act(() => server.emit('run.output', { runId: 'r9', seq: 1, text: 'Hi, ' }));
    act(() => server.emit('run.output', { runId: 'r9', seq: 2, text: 'how can I help?' }));
    expect(await screen.findByText('Hi, how can I help?')).toBeInTheDocument();
  });

  it('shows refused messages', async () => {
    await renderChat({ 'chat.send': async () => ({ ok: false as const, reason: 'The agent is still answering in this thread.' }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Again');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still answering');
  });
});

describe('US-062 AC-4: limited mode', () => {
  it('disables the input with the reason', async () => {
    await renderChat({}, 'AI functions are disabled.');
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const input = await screen.findByRole('textbox', { name: 'Message' });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('title', 'AI functions are disabled.');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('US-098 AC-3: changes under each chat answer', () => {
  const changed = msg({
    id: 'm3',
    role: 'assistant',
    content: 'Fixed the typo.',
    runId: 'r2',
    changes: [
      { id: 'c1', path: 'README.md', change: 'M', isSpec: false, revertedAt: null },
      { id: 'c2', path: 'spec/02_requirements/fr.md', change: 'M', isSpec: true, revertedAt: null },
    ],
    untracked: ['local.env'],
  });

  it('shows "Changed n files" with spec / code labels, untracked files and expandable diffs', async () => {
    const diff = vi.fn(async () => ({ path: 'README.md', before: 'teh\n', after: 'the\n' }));
    await renderChat({ 'chat.messages': async () => [changed], 'chat.changeDiff': diff });
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const changes = await screen.findByRole('group', { name: 'Changed 2 files' });
    const readme = within(changes).getByRole('listitem', { name: 'README.md' });
    expect(readme).toHaveTextContent('code — outside Kanban flow');
    expect(within(changes).getByRole('listitem', { name: 'spec/02_requirements/fr.md' })).toHaveTextContent('spec (now Draft)');
    expect(changes).toHaveTextContent('Not tracked (ignored): local.env');
    await userEvent.click(within(readme).getByRole('button', { name: 'Diff of README.md' }));
    expect(diff).toHaveBeenCalledWith({ changeId: 'c1' });
    expect(await within(readme).findByRole('region', { name: 'Diff of README.md' })).toBeInTheDocument();
  });
});

describe('US-099: reverting chat changes in the thread', () => {
  const answer = (revertedAt: string | null = null) =>
    msg({
      id: 'm3',
      role: 'assistant',
      content: 'Fixed the typo.',
      runId: 'r2',
      changes: [
        { id: 'c1', path: 'README.md', change: 'M', isSpec: false, revertedAt },
        { id: 'c2', path: 'docs/new.md', change: 'A', isSpec: false, revertedAt },
      ],
    });

  it('AC-1: reverts the whole message or a single file', async () => {
    const revert = vi.fn(async () => ({ reverted: ['README.md'] }));
    await renderChat({ 'chat.messages': async () => [answer()], 'chat.revert': revert });
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revert this change' }));
    expect(revert).toHaveBeenCalledWith({ runId: 'r2' });
    const readme = screen.getByRole('listitem', { name: 'README.md' });
    await userEvent.click(within(readme).getByRole('button', { name: 'Revert README.md' }));
    expect(revert).toHaveBeenLastCalledWith({ changeId: 'c1' });
  });

  it('AC-2: a file changed since the message needs confirmation with its diffs', async () => {
    const revert = vi.fn(async (input: { confirm?: boolean }) =>
      input.confirm
        ? { reverted: ['README.md'] }
        : { needsConfirmation: [{ changeId: 'c1', path: 'README.md', baseline: 'teh\n', chat: 'the\n', current: 'the\nlater\n' }] },
    );
    await renderChat({ 'chat.messages': async () => [answer()], 'chat.revert': revert as never });
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revert this change' }));
    const dialog = await screen.findByRole('dialog', { name: 'Files changed since this message' });
    expect(within(dialog).getByRole('region', { name: 'README.md: chat change' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'README.md: changed since' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revert anyway' }));
    expect(revert).toHaveBeenLastCalledWith({ runId: 'r2', confirm: true });
  });

  it('AC-3: the thread shows the reverted state', async () => {
    await renderChat({ 'chat.messages': async () => [answer('2026-11-20T11:00:00.000Z')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const changes = await screen.findByRole('group', { name: 'Changed 2 files' });
    expect(changes).toHaveTextContent('Reverted');
    expect(within(changes).queryByRole('button', { name: 'Revert this change' })).not.toBeInTheDocument();
    expect(within(changes).queryByRole('button', { name: 'Revert README.md' })).not.toBeInTheDocument();
  });
});

describe('US-100: features and ideas from the chat', () => {
  const suggesting = msg({
    id: 'm4',
    role: 'assistant',
    content: 'That would be new functionality.',
    runId: 'r4',
    recommendations: [{ type: 'feature', text: 'Users comment on tasks.' }],
  });

  it('AC-1/AC-3: a feature suggestion shows a card that opens the wizard pre-filled; nothing is written', async () => {
    const onCreateFeature = vi.fn();
    const handlers = { 'chat.messages': async () => [msg({ id: 'm1', content: 'Comments?' }), suggesting] };
    const core = await fakeCoreWithEvents({
      'chat.threads': async () => [{ id: 't1', title: 'Planning', updatedAt: 't', active: false }],
      ...handlers,
    });
    render(<ChatPanel session={core.session} projectId="p1" onCreateFeature={onCreateFeature} onSaveAsIdea={vi.fn()} />);
    await userEvent.click(screen.getByText('Project chat'));
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const card = await screen.findByRole('note', { name: 'Create a feature intent from this conversation?' });
    expect(card).toHaveTextContent('Users comment on tasks.');
    expect(screen.queryByText(/SpecForge does not do this for you/)).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Create feature intent' }));
    expect(onCreateFeature).toHaveBeenCalledWith('Users comment on tasks.');
  });

  it('AC-2: every message offers Save as idea with its text', async () => {
    const onSaveAsIdea = vi.fn();
    const core = await fakeCoreWithEvents({
      'chat.threads': async () => [{ id: 't1', title: 'Planning', updatedAt: 't', active: false }],
      'chat.messages': async () => [msg({ id: 'm1', content: 'Export the board as PDF?' }), suggesting],
    });
    render(<ChatPanel session={core.session} projectId="p1" onCreateFeature={vi.fn()} onSaveAsIdea={onSaveAsIdea} />);
    await userEvent.click(screen.getByText('Project chat'));
    await userEvent.click(await screen.findByRole('button', { name: 'Planning' }));
    const buttons = await screen.findAllByRole('button', { name: 'Save as idea' });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]!);
    expect(onSaveAsIdea).toHaveBeenCalledWith('Export the board as PDF?');
  });
});
