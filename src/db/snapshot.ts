import 'server-only';

import { getSupabaseAdminClient } from '@/db/admin';
import { BACKUP_MAX_ROWS, BACKUP_TABLES } from '@/config/backup';
import type { BackupRecord, TableData } from '@/usecases/build-snapshot';

/**
 * バックアップ対象の表を読み出す。
 *
 * `BACKUP_MAX_ROWS + 1` 件までしか読まない（AGENTS.md の
 * 「一覧を読むクエリには `.limit()` を付ける」ルール）。上限をちょうどではなく
 * 1 件多く読むのは、`buildSnapshot` 側で「上限を超えたか」を判定するため。
 * 超えた分の中身そのものはタブに書き出さない。
 */
export async function fetchBackupTables(): Promise<TableData[]> {
  const supabase = getSupabaseAdminClient();

  const tables: TableData[] = [];
  for (const { table, label } of BACKUP_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(BACKUP_MAX_ROWS + 1);
    if (error) throw error;

    tables.push({ table, label, rows: (data ?? []).map(toBackupRecord) });
  }
  return tables;
}

/**
 * DB の 1 行をセルに書ける値だけの行に変換する。
 * `write_logs.detail` のような JSON 列はそのままではセルに書けないので文字列化する。
 */
function toBackupRecord(row: Record<string, unknown>): BackupRecord {
  const record: BackupRecord = {};
  for (const [column, value] of Object.entries(row)) {
    record[column] =
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? value
        : JSON.stringify(value);
  }
  return record;
}
