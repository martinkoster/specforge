// SPDX-License-Identifier: Apache-2.0
// Installed agent runtimes (data_model.md §2.1, FR-048).
import type { Database as Sqlite } from 'better-sqlite3';

export interface AgentRuntimeRecord {
  adapterType: string;
  executablePath: string;
  detectedVersion: string | null;
  verifiedAt: string | null;
  updatedAt: string;
  /** Reported by the adapter (e.g. available models). */
  capabilities: { models?: string[] };
}

export class AgentRuntimeRepository {
  constructor(private readonly sqlite: Sqlite) {}

  save(record: { adapterType: string; executablePath: string; detectedVersion: string | null; verified: boolean }): void {
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `insert into agent_runtime (adapter_type, executable_path, detected_version, verified_at, updated_at)
         values (@adapterType, @executablePath, @detectedVersion, @verifiedAt, @now)
         on conflict (adapter_type) do update set executable_path = excluded.executable_path,
           detected_version = excluded.detected_version, verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
      )
      .run({ ...record, verifiedAt: record.verified ? now : null, now });
  }

  get(adapterType: string): AgentRuntimeRecord | undefined {
    const row = this.sqlite.prepare('select * from agent_runtime where adapter_type = ?').get(adapterType) as
      | {
          adapter_type: string;
          executable_path: string;
          detected_version: string | null;
          verified_at: string | null;
          updated_at: string;
          capabilities: string;
        }
      | undefined;
    return row
      ? {
          adapterType: row.adapter_type,
          executablePath: row.executable_path,
          detectedVersion: row.detected_version,
          verifiedAt: row.verified_at,
          updatedAt: row.updated_at,
          capabilities: JSON.parse(row.capabilities) as { models?: string[] },
        }
      : undefined;
  }
}
