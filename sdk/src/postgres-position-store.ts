import { Pool } from "pg";
import type { IndexedPosition, PositionSnapshotRepository } from "./onchain-indexer.js";

export class PostgresPositionSnapshotRepository implements PositionSnapshotRepository {
  constructor(private readonly pool: Pool) {}

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS handel_indexer_cursors (
        contract_id text PRIMARY KEY,
        next_position_id bigint NOT NULL DEFAULT 0,
        block_height bigint NOT NULL,
        block_hash text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS handel_positions (
        contract_id text NOT NULL,
        position_id numeric(20,0) NOT NULL,
        writer text NOT NULL,
        holder text NOT NULL,
        state text NOT NULL,
        payload jsonb NOT NULL,
        block_height bigint NOT NULL,
        block_hash text NOT NULL,
        indexed_at timestamptz NOT NULL,
        PRIMARY KEY (contract_id, position_id)
      );
      CREATE INDEX IF NOT EXISTS handel_positions_writer_idx ON handel_positions (writer, position_id DESC);
      CREATE INDEX IF NOT EXISTS handel_positions_holder_idx ON handel_positions (holder, position_id DESC);
      CREATE TABLE IF NOT EXISTS handel_position_activity (
        activity_id text PRIMARY KEY,
        contract_id text NOT NULL,
        position_id numeric(20,0) NOT NULL,
        account_id text NOT NULL,
        event_type text NOT NULL,
        previous_state text,
        current_state text NOT NULL,
        block_height bigint NOT NULL,
        block_hash text NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        payload jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS handel_position_activity_account_idx ON handel_position_activity (account_id, block_height DESC);
    `);
  }

  async getCursor(contractId: string): Promise<number> {
    const result = await this.pool.query<{ next_position_id: string }>(
      "SELECT next_position_id::text FROM handel_indexer_cursors WHERE contract_id = $1", [contractId],
    );
    return result.rows[0] ? Number(result.rows[0].next_position_id) : 0;
  }

  async setCursor(contractId: string, nextId: number, blockHeight: number, blockHash: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO handel_indexer_cursors (contract_id,next_position_id,block_height,block_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (contract_id) DO UPDATE SET next_position_id=GREATEST(handel_indexer_cursors.next_position_id,EXCLUDED.next_position_id),
       block_height=EXCLUDED.block_height, block_hash=EXCLUDED.block_hash, updated_at=now()`,
      [contractId, nextId, blockHeight, blockHash],
    );
  }

  async upsertPositions(rows: readonly IndexedPosition[]): Promise<void> {
    if (!rows.length) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        const p = row.position;
        const id = String(p.id);
        const state = String(p.state ?? "unknown");
        const prior = await client.query<{ state: string }>(
          "SELECT state FROM handel_positions WHERE contract_id=$1 AND position_id=$2 FOR UPDATE",
          [row.contractId, id],
        );
        await client.query(
          `INSERT INTO handel_positions (contract_id,position_id,writer,holder,state,payload,block_height,block_hash,indexed_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           ON CONFLICT (contract_id,position_id) DO UPDATE SET writer=EXCLUDED.writer,holder=EXCLUDED.holder,
           state=EXCLUDED.state,payload=EXCLUDED.payload,block_height=EXCLUDED.block_height,
           block_hash=EXCLUDED.block_hash,indexed_at=EXCLUDED.indexed_at`,
          [row.contractId,id,p.writer,p.holder,state,JSON.stringify(p),row.blockHeight,row.blockHash,row.indexedAt],
        );
        const previous = prior.rows[0]?.state ?? null;
        if (previous !== state) {
          const activityId = [row.contractId,id,previous ?? "created",state,row.blockHash].join(":");
          for (const accountId of new Set([p.writer,p.holder])) {
            await client.query(
              `INSERT INTO handel_position_activity (activity_id,contract_id,position_id,account_id,event_type,previous_state,current_state,block_height,block_hash,payload)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT (activity_id) DO NOTHING`,
              [activityId+":"+accountId,row.contractId,id,accountId,previous===null?"position_discovered":"position_state_changed",previous,state,row.blockHeight,row.blockHash,JSON.stringify(p)],
            );
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPositions(accountId: string, limit = 100): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT contract_id,position_id::text,writer,holder,state,payload,block_height,block_hash,indexed_at
       FROM handel_positions WHERE writer=$1 OR holder=$1 ORDER BY position_id DESC LIMIT $2`,
      [accountId, Math.max(1,Math.min(limit,250))],
    );
    return result.rows;
  }

  async listActivity(accountId: string, limit = 100): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT activity_id,contract_id,position_id::text,event_type,previous_state,current_state,
       block_height,block_hash,occurred_at,payload FROM handel_position_activity
       WHERE account_id=$1 ORDER BY block_height DESC,activity_id DESC LIMIT $2`,
      [accountId, Math.max(1,Math.min(limit,250))],
    );
    return result.rows;
  }

  async close(): Promise<void> { await this.pool.end(); }
}
