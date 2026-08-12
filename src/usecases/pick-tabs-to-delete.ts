import { BACKUP_MAX_TABS } from '@/config/backup';

/**
 * タブ名が `HH-mm`（例 `10-15`）ちょうどの形かどうか。
 *
 * 同名衝突時に付く `10-15-2` のような別名や、初期状態の `Sheet1` は
 * この形に一致しない。バックアップが作ったタブだけを掃除の対象にするための線引き。
 */
const HH_MM_PATTERN = /^([01]\d|2[0-3])-[0-5]\d$/;

/**
 * 消すタブを選ぶ。
 *
 * `existingTabNames` はスプレッドシート上の並び順（= 作成順、古い→新しい）で渡す。
 * `HH-mm` 形式のタブだけを対象に数え、新しい `keep` 個を残して、
 * それより古いものだけを「消す対象」として返す。
 *
 * `HH-mm` 形式でない名前（別名で作られたタブや、スプレッドシート既定の
 * `Sheet1` など）は数にも入れず、絶対に返さない。人が別の理由で
 * 作ったタブをバックアップの掃除で誤って消さないため。
 */
export function pickTabsToDelete(
  existingTabNames: string[],
  keep: number = BACKUP_MAX_TABS
): string[] {
  const backupTabs = existingTabNames.filter((name) => HH_MM_PATTERN.test(name));
  if (backupTabs.length <= keep) return [];
  return backupTabs.slice(0, backupTabs.length - keep);
}
