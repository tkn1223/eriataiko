import type { Database } from '@/types/database';

type TableName = keyof Database['public']['Tables'];

/**
 * 大会当日にバックアップする表の一覧。
 *
 * あとで試合や得点の表が増えたら、ここに 1 行足すだけで
 * 次のバックアップから一緒に書き出される。
 */
export const BACKUP_TABLES: { table: TableName; label: string }[] = [
  // 大会のデータ。当日これが消えると大会が止まるので、全部書き出す。
  { table: 'competitions', label: '大会' },
  { table: 'divisions', label: '部' },
  { table: 'teams', label: 'チーム' },
  { table: 'players', label: '人' },
  { table: 'entries', label: '参加' },
  { table: 'stages', label: '段（予選・決勝）' },
  { table: 'team_matches', label: '対戦' },
  { table: 'matches', label: '試合' },
  { table: 'match_players', label: '出場者' },
  { table: 'games', label: '得点' },
  // 誰が何を書いたか。データが壊れたときに突き合わせる。
  { table: 'write_logs', label: '書き込み履歴' },
];

/**
 * 1 つの表から書き出す行数の上限。
 * 超えた分は書き出さず、タブに「一部だけです」と分かる文字を残す。
 */
export const BACKUP_MAX_ROWS = 5000;

/**
 * 残すタブの数。これを超えたら古いタブから消す。
 * スプレッドシートのタブ数には上限 200 があり、当日 15 分おきに増え続けると
 * いつか当たって止まってしまうため、余裕を持って 60 に抑える。
 */
export const BACKUP_MAX_TABS = 60;

/** バックアップ API を守る秘密のヘッダー名。 */
export const BACKUP_SECRET_HEADER = 'x-backup-secret';
