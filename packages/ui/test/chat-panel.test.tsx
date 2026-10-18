// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers, QueryOutput } from '@specforge/ipc-contract';
import { ChatPanel } from '../src/dashboard/ChatPanel.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(async () => {
  cleanup();
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
