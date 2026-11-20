// SPDX-License-Identifier: Apache-2.0
// Project chat on the dashboard (US-062, UC-035, UF-13): threads, streamed answers, collapsed tool-use lines and
// recommendation cards; writes are approved in the permission prompts (US-097); input disabled in limited mode.
import { useCallback, useEffect, useState } from 'react';
import type { CommandOutput, QueryOutput } from '@specforge/ipc-contract';
import { Dialog } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';
import { DiffView } from '../review/DiffView.js';

type Thread = QueryOutput<'chat.threads'>[number];
type Message = QueryOutput<'chat.messages'>[number];

export interface ChatPanelProps {
  session: CoreSession;
  projectId: string;
  aiDisabledReason?: string | null;
  /** US-100 AC-1: opens the feature wizard pre-filled with the agent's summary. */
  onCreateFeature?(text: string): void;
  /** US-100 AC-2: opens *Capture idea* with the message text. */
  onSaveAsIdea?(text: string): void;
}

type Change = NonNullable<Message['changes']>[number];
type Conflicts = Extract<CommandOutput<'chat.revert'>, { needsConfirmation: unknown }>['needsConfirmation'];
type RevertTarget = { runId: string } | { changeId: string };

/** One changed file: label, change type, the diff on demand (US-098 AC-3) and *Revert* (US-099 AC-1). */
function ChangeRow({ session, change, onRevert }: { session: CoreSession; change: Change; onRevert(): void }) {
  const [diff, setDiff] = useState<{ before: string; after: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    if (diff) return setDiff(null);
    void session
      .client()
      .query('chat.changeDiff', { changeId: change.id })
      .then(
        (d) => setDiff({ before: d.before ?? '', after: d.after ?? '' }),
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
  };
  return (
    <li aria-label={change.path} className="chat-change">
      <span className="mono">{change.path}</span> <span className="badge badge-neutral">{change.change}</span>{' '}
      <span className={change.isSpec ? 'badge badge-warning' : 'badge badge-info'}>
        {change.isSpec ? 'spec (now Draft)' : 'code — outside Kanban flow'}
      </span>{' '}
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        aria-label={`Diff of ${change.path}`}
        aria-pressed={diff !== null}
        onClick={toggle}
      >
        Diff
      </button>{' '}
      {change.revertedAt ? (
        <span className="badge badge-neutral">Reverted</span>
      ) : (
        <button className="btn btn-ghost btn-sm" type="button" aria-label={`Revert ${change.path}`} onClick={onRevert}>
          Revert
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {diff && (
        <section aria-label={`Diff of ${change.path}`}>
          <DiffView before={diff.before} after={diff.after} mode="unified" label={change.path} />
        </section>
      )}
    </li>
  );
}

/** US-099 AC-2: files changed since the message — what the chat changed and what changed since — before reverting. */
function RevertConfirm({ conflicts, onConfirm, onCancel }: { conflicts: Conflicts; onConfirm(): void; onCancel(): void }) {
  return (
    <Dialog title="Files changed since this message" onClose={onCancel}>
      <p>
        These files were changed after the chat answered. Reverting restores the content from before the message and discards the later
        edits.
      </p>
      {conflicts.map((c) => (
        <div key={c.changeId}>
          <h4 className="mono">{c.path}</h4>
          <section aria-label={`${c.path}: chat change`}>
            <p className="hint">Changed by the chat</p>
            <DiffView before={c.baseline} after={c.chat} mode="unified" label={`${c.path} (chat)`} />
          </section>
          <section aria-label={`${c.path}: changed since`}>
            <p className="hint">Changed since</p>
            <DiffView before={c.chat} after={c.current} mode="unified" label={`${c.path} (since)`} />
          </section>
        </div>
      ))}
      <div className="dialog-footer">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-danger" type="button" onClick={onConfirm}>
          Revert anyway
        </button>
      </div>
    </Dialog>
  );
}

/** US-098 AC-3 / US-099: "Changed n files" under an answer, untracked files, revert per message or file. */
function MessageChanges({ session, message, onChanged }: { session: CoreSession; message: Message; onChanged(): void }) {
  const [pending, setPending] = useState<{ target: RevertTarget; conflicts: Conflicts } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changes = message.changes ?? [];
  const untracked = message.untracked ?? [];
  if (changes.length === 0 && untracked.length === 0) return null;
  const title = `Changed ${changes.length} ${changes.length === 1 ? 'file' : 'files'}`;
  const allReverted = changes.length > 0 && changes.every((c) => c.revertedAt !== null);
  const revert = (target: RevertTarget, confirm = false) => {
    setError(null);
    void session
      .client()
      .command('chat.revert', { ...target, ...(confirm ? { confirm: true } : {}) })
      .then(
        (result) => {
          if ('needsConfirmation' in result) return setPending({ target, conflicts: result.needsConfirmation });
          setPending(null);
          onChanged();
        },
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
  };
  return (
    <details className="chat-changes" role="group" aria-label={title} open>
      <summary>
        {title}
        {allReverted && ' · Reverted'}
      </summary>
      {error && <p role="alert">{error}</p>}
      <ul>
        {changes.map((c) => (
          <ChangeRow key={c.id} session={session} change={c} onRevert={() => revert({ changeId: c.id })} />
        ))}
      </ul>
      {untracked.length > 0 && <p className="hint">Not tracked (ignored): {untracked.join(', ')}</p>}
      {!allReverted && message.runId && changes.length > 0 && (
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => revert({ runId: message.runId! })}>
          Revert this change
        </button>
      )}
      {pending && (
        <RevertConfirm conflicts={pending.conflicts} onCancel={() => setPending(null)} onConfirm={() => revert(pending.target, true)} />
      )}
    </details>
  );
}

interface MessageViewProps {
  message: Message;
  session: CoreSession;
  onChanged(): void;
  onCreateFeature?(text: string): void;
  onSaveAsIdea?(text: string): void;
}

function MessageView({ message, session, onChanged, onCreateFeature, onSaveAsIdea }: MessageViewProps) {
  return (
    <li className={`chat-message chat-${message.role}${message.error ? ' chat-error' : ''}`}>
      <span className="chat-author">{message.role === 'user' ? 'You' : 'Agent'}</span>
      <p>{message.content}</p>
      {message.toolUses.length > 0 && (
        <details>
          <summary>{message.toolUses.length === 1 ? '1 tool use' : `${message.toolUses.length} tool uses`}</summary>
          <ul>
            {message.toolUses.map((t, i) => (
              <li key={i}>
                <code>{t}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      <MessageChanges session={session} message={message} onChanged={onChanged} />
      {message.recommendations.map((r, i) =>
        r.type === 'feature' && onCreateFeature ? (
          <div key={i} role="note" aria-label="Create a feature intent from this conversation?" className="recommendation">
            <p>Create a feature intent from this conversation?</p>
            <p className="hint">{r.text}</p>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCreateFeature(r.text)}>
              Create feature intent
            </button>
          </div>
        ) : (
          <div key={i} role="note" className="recommendation">
            Recommendation: {r.text}
            <span className="hint"> (SpecForge does not do this for you; act on the board if you agree.)</span>
          </div>
        ),
      )}
      {onSaveAsIdea && !message.error && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onSaveAsIdea(message.content)}>
          Save as idea
        </button>
      )}
    </li>
  );
}

export function ChatPanel({ session, projectId, aiDisabledReason = null, onCreateFeature, onSaveAsIdea }: ChatPanelProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<{ runId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const loadThreads = useCallback(
    async () => setThreads(await session.client().query('chat.threads', { projectId })),
    [session, projectId],
  );
  const loadMessages = useCallback(
    async (threadId: string) => setMessages(await session.client().query('chat.messages', { threadId })),
    [session],
  );

  useEffect(() => {
    void loadThreads().catch(() => setThreads([]));
  }, [loadThreads]);

  useEffect(() => {
    const client = session.client();
    const offs = [
      client.subscribe('chat.message', (e) => {
        if (e.projectId !== projectId) return;
        void loadThreads().catch(() => undefined);
        if (e.threadId === current) {
          void loadMessages(e.threadId).catch(() => undefined);
          setStreaming(null);
        }
      }),
      client.subscribe('run.output', (e) => {
        setStreaming((s) => (s && s.runId === e.runId ? { ...s, text: s.text + e.text } : s));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [session, projectId, current, loadThreads, loadMessages]);

  const open = (threadId: string) => {
    setCurrent(threadId);
    setStreaming(null);
    void loadMessages(threadId).catch(fail);
  };

  const send = async () => {
    if (!current) return;
    setError(null);
    const result = await session.client().command('chat.send', { threadId: current, text });
    if (!result.ok) return setError(result.reason);
    setText('');
    setStreaming({ runId: result.runId, text: '' });
    await loadMessages(current);
  };

  const disabled = aiDisabledReason !== null;
  return (
    <details className="chat-panel">
      <summary>Project chat</summary>
      {error && <p role="alert">{error}</p>}
      <nav aria-label="Chat threads">
        <ul>
          {threads.map((t) => (
            <li key={t.id}>
              <button
                className="btn btn-secondary"
                type="button"
                aria-current={t.id === current ? 'true' : undefined}
                onClick={() => open(t.id)}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() =>
            void session
              .client()
              .command('chat.createThread', { projectId, title: 'New thread' })
              .then(async (t) => {
                await loadThreads();
                open(t.id);
              })
              .catch(fail)
          }
        >
          New thread
        </button>
      </nav>
      {current && (
        <section aria-label="Thread">
          <ul role="log" aria-label="Messages">
            {messages.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                session={session}
                onChanged={() => void loadMessages(current).catch(fail)}
                {...(onCreateFeature ? { onCreateFeature } : {})}
                {...(onSaveAsIdea ? { onSaveAsIdea } : {})}
              />
            ))}
            {streaming && streaming.text && (
              <li className="chat-message chat-assistant chat-streaming">
                <strong>Agent</strong>
                <p>{streaming.text}</p>
              </li>
            )}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send().catch(fail);
            }}
          >
            <textarea
              className="textarea"
              aria-label="Message"
              rows={2}
              value={text}
              disabled={disabled}
              title={aiDisabledReason ?? undefined}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={disabled || text.trim() === '' || streaming !== null}>
              Send
            </button>
          </form>
        </section>
      )}
    </details>
  );
}
