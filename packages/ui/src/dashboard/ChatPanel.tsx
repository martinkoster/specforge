// SPDX-License-Identifier: Apache-2.0
// Read-only project chat on the dashboard (US-062, UC-035, UF-13): threads, streamed answers, collapsed tool-use
// lines and recommendation cards; input disabled in limited mode.
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';

type Thread = QueryOutput<'chat.threads'>[number];
type Message = QueryOutput<'chat.messages'>[number];

export interface ChatPanelProps {
  session: CoreSession;
  projectId: string;
  aiDisabledReason?: string | null;
}

function MessageView({ message }: { message: Message }) {
  return (
    <li className={`chat-message chat-${message.role}${message.error ? ' chat-error' : ''}`}>
      <strong>{message.role === 'user' ? 'You' : 'Agent'}</strong>
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
      {message.recommendations.map((r, i) => (
        <div key={i} role="note" className="recommendation">
          Recommendation: {r.text}
          <span className="hint"> (SpecForge does not do this for you; act on the board if you agree.)</span>
        </div>
      ))}
    </li>
  );
}

export function ChatPanel({ session, projectId, aiDisabledReason = null }: ChatPanelProps) {
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
              <button type="button" aria-current={t.id === current ? 'true' : undefined} onClick={() => open(t.id)}>
                {t.title}
              </button>
            </li>
          ))}
        </ul>
        <button
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
              <MessageView key={m.id} message={m} />
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
              aria-label="Message"
              rows={2}
              value={text}
              disabled={disabled}
              title={aiDisabledReason ?? undefined}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={disabled || text.trim() === '' || streaming !== null}>
              Send
            </button>
          </form>
        </section>
      )}
    </details>
  );
}
