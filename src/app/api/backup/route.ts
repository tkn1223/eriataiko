import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiError, toErrorResponse } from '@/server/route-helpers';
import { serverEnv } from '@/config/env.server';
import { BACKUP_MAX_TABS, BACKUP_SECRET_HEADER } from '@/config/backup';
import { fetchBackupTables } from '@/db/snapshot';
import { createTabWithValues, deleteTabs, listSheetTabs } from '@/db/google-sheets';
import { buildSnapshot } from '@/usecases/build-snapshot';
import { pickTabsToDelete } from '@/usecases/pick-tabs-to-delete';

/**
 * 大会当日、GitHub Actions（.github/workflows/backup.yml）から 15 分おきに叩かれる。
 *
 * このアプリの他の書き込み API と違い、`requireOperator()` から始めない。
 * Supabase には一切書き込まない（読むだけ）ので、AGENTS.md の「書き込みは
 * requireOperator() から」は当てはまらない（docs/specs/2026-08-13-backup-to-sheets.md
 * の「決めたこと」参照）。代わりに秘密のヘッダーで守る。
 *
 * データは返さないので、万一叩かれても情報は漏れない。起きるのはタブが増えることだけで、
 * それは古いタブを消す処理で抑える。
 */
export async function POST(request: Request) {
  try {
    requireBackupSecret(request);

    const [tables, existingTabs] = await Promise.all([fetchBackupTables(), listSheetTabs()]);

    const snapshot = buildSnapshot({
      now: new Date(),
      existingTabNames: existingTabs.map((tab) => tab.title),
      tables,
    });
    await createTabWithValues(snapshot.tabName, snapshot.values);

    // 掃除は「作った後」の並びで数える。いま作ったタブ自体を消してしまわないため。
    const tabNamesAfterCreate = [...existingTabs.map((tab) => tab.title), snapshot.tabName];
    const namesToDelete = pickTabsToDelete(tabNamesAfterCreate, BACKUP_MAX_TABS);
    if (namesToDelete.length > 0) {
      const idsToDelete = existingTabs
        .filter((tab) => namesToDelete.includes(tab.title))
        .map((tab) => tab.sheetId);
      await deleteTabs(idsToDelete);
    }

    return NextResponse.json({ ok: true, tabName: snapshot.tabName });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 秘密のヘッダーが無い・違う場合は 401。長さの差から中身が漏れないよう定数時間で比較する（src/server/session.ts の verifyPasscode と同じ考え方）。 */
function requireBackupSecret(request: Request) {
  const provided = request.headers.get(BACKUP_SECRET_HEADER) ?? '';
  const expected = serverEnv().BACKUP_SECRET;

  // 未設定のときも 401 を返す（設定の有無を外から探れないようにするため）が、
  // それだと「値の食い違い」と区別できず当日ハマるので、ログには理由を残す。
  if (expected.length === 0) {
    console.error('[backup] BACKUP_SECRET が Vercel に未設定です。docs/backup.md を参照。');
  }

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  const matches = provided.length > 0 && expected.length > 0 && timingSafeEqual(a, b);

  if (!matches) {
    throw new ApiError(401, '秘密のヘッダーが無いか、値が違います。');
  }
}
