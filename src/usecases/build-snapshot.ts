import { BACKUP_MAX_ROWS } from '@/config/backup';

/** DB から読んだ 1 行。セルに書ける値だけを許す（ネストした JSON はここでは扱わない）。 */
export type BackupRecord = Record<string, string | number | boolean | null>;

/** バックアップ対象の表 1 つぶんのデータ。 */
export type TableData = {
  /** `src/config/backup.ts` の table 名。 */
  table: string;
  /** タブの中に書く見出し文字。 */
  label: string;
  /**
   * 読み出した行。`BACKUP_MAX_ROWS + 1` 件まで渡してよい。
   * 「上限を超えたか」をここで判定するため、超えた分は buildSnapshot 側で切り捨てる。
   */
  rows: BackupRecord[];
};

/** スプレッドシートの values.update にそのまま渡せる 2 次元配列。 */
export type SheetValues = (string | number | boolean | null)[][];

export type BuildSnapshotInput = {
  /**
   * タブ名に使う時刻。呼び出し側から渡してもらう。
   * テストで時刻を固定できるよう、この関数の中では `new Date()` を呼ばない。
   */
  now: Date;
  /** スプレッドシートに既にあるタブ名の一覧（同名衝突の判定に使う）。 */
  existingTabNames: string[];
  /** 書き出す表のデータ。`src/config/backup.ts` の一覧の順に渡す。 */
  tables: TableData[];
};

export type BuildSnapshotResult = {
  /** これから作るタブの名前。 */
  tabName: string;
  /** タブに書き込む 2 次元配列。 */
  values: SheetValues;
};

/**
 * 15 分おきのバックアップ 1 回ぶんのタブ名と中身を組み立てる。
 *
 * DB にも Google にも触らない純粋関数。実際のデータの読み書きは
 * `src/db/snapshot.ts` と `src/db/google-sheets.ts` が担当する。
 */
export function buildSnapshot(input: BuildSnapshotInput): BuildSnapshotResult {
  return {
    tabName: resolveTabName(jstHourMinute(input.now), input.existingTabNames),
    values: input.tables.flatMap((table, index) => tableToRows(table, index > 0)),
  };
}

/** 日本時間の `HH-mm` を返す。ホスト（GitHub Actions は UTC）のタイムゾーンに依存しない。 */
function jstHourMinute(now: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}-${minute}`;
}

/** 既に同じ名前のタブがあれば `-2` `-3` ... と付けて別名にする。 */
function resolveTabName(base: string, existingTabNames: string[]): string {
  if (!existingTabNames.includes(base)) return base;

  let suffix = 2;
  while (existingTabNames.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

/** 1 つの表を「見出し → 列名 → データ」の行に変換する。表の間は空行 1 行で区切る。 */
function tableToRows(table: TableData, withLeadingBlankRow: boolean): SheetValues {
  const truncated = table.rows.length > BACKUP_MAX_ROWS;
  const rows = truncated ? table.rows.slice(0, BACKUP_MAX_ROWS) : table.rows;
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const heading = truncated
    ? `${table.label}（一部だけです。先頭 ${BACKUP_MAX_ROWS} 件のみ）`
    : table.label;

  const block: SheetValues = [[heading]];
  if (columns.length > 0) {
    block.push(columns);
    for (const row of rows) {
      block.push(columns.map((column) => row[column]));
    }
  }

  return withLeadingBlankRow ? [[], ...block] : block;
}
