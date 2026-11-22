import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 * （`src/ui/courts/no-db-import.test.ts` と同じ見張り方）
 *
 * - `src/ui/matches/*`（部品）は `@/db` を一切 import しない
 * - 見るだけの部品は、書き込みの道具（点・終了・取り消しを入口へ送る道具）も使わない。
 *   書き込みは直す画面（`correct-match-form.tsx`）だけで、**入口（`PUT /api/matches/[matchId]/correction`）へ
 *   送る道具を通す**（Supabase の表は直接触らない）
 * - `page.tsx` は読み取りに `createSupabaseServerClient()` を使ってよいが、
 *   `getSupabaseAdminClient()`（`@/db/admin`）は使わない
 *   （AGENTS.md の「破ってはいけない 3 つ」の 2 番目）
 */
const READ_ONLY_FILES = [
  'src/ui/matches/matches-page.tsx',
  'src/ui/matches/matches-subtitle.tsx',
  'src/ui/matches/court-card.tsx',
  'src/ui/matches/court-chips.tsx',
  'src/ui/matches/court-matches.tsx',
  'src/ui/matches/court-summary.ts',
  'src/ui/matches/match-row.tsx',
  'src/ui/matches/match-parts.tsx',
  'src/ui/matches/match-detail.tsx',
  'src/ui/matches/search-matches.ts',
  'src/ui/matches/search-results.tsx',
  'src/ui/matches/derive-matches-courts.ts',
  'src/ui/matches/use-live-matches.ts',
  'src/ui/matches/types.ts',
];

/** 書き込みの入口へ送る画面。送り方は共通の道具（`sendRequest`）だけを通す。 */
const WRITER_FILES = [
  'src/ui/matches/correct-match-form.tsx',
  'src/ui/matches/correction-draft.ts',
];

const UI_COMPONENT_FILES = [...READ_ONLY_FILES, ...WRITER_FILES];

const PAGE_FILES = [
  'src/app/(app)/matches/page.tsx',
  'src/app/(app)/matches/[matchId]/page.tsx',
  'src/app/(app)/matches/[matchId]/correct/page.tsx',
];

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('/matches の画面', () => {
  test.each(UI_COMPONENT_FILES)('%s は @/db を import していない', (path) => {
    expect(readSource(path)).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
  });

  // 書き込みは Route Handler 経由だけ（AGENTS.md の「破ってはいけない 3 つ」の 1 番目）。
  // どの部品も Supabase の表を直接触らず、fetch も自分では呼ばない。
  test.each(UI_COMPONENT_FILES)(
    '%s は Supabase の表を直接触らず、fetch も自分では呼ばない',
    (path) => {
      const source = readSource(path);
      expect(source).not.toMatch(/\.from\(\s*['"`]|\.rpc\(/);
      expect(source).not.toMatch(/\bfetch\(/);
    }
  );

  // 見るだけの部品は、試合速報の書き込みの道具（点・終了・取り消しを入口へ送る）も使わない
  test.each(READ_ONLY_FILES)('%s は書き込みの道具を使わない', (path) => {
    expect(readSource(path)).not.toMatch(/@\/ui\/courts\/(use-score-sync|send-request)['"]/);
  });

  // 直す画面が書くのは訂正の入口だけ。点を 1 点ずつ送る試合速報の道具（use-score-sync）は使わない
  test('直す画面は共通の送る道具（sendRequest）で、訂正の入口（correction）だけへ送る', () => {
    const source = readSource('src/ui/matches/correct-match-form.tsx');

    expect(source).toMatch(/from\s+['"]@\/ui\/courts\/send-request['"]/);
    expect(source).not.toMatch(/@\/ui\/courts\/use-score-sync/);
    expect(source).toMatch(/\/api\/matches\/\$\{match\.matchId\}\/correction/);
    expect(source).not.toMatch(/\/(scores|result|scorer)['"`]/);
  });

  // 購読と「届いた行を当てる判断」は結果LIVE と共有する。進行表で作り直すと、
  // 同じ試合が 2 つの画面で違って見える原因になる（docs/specs/2026-10-14-matches-real-data.md の「決めたこと」3）。
  test('use-live-matches.ts は結果LIVE の購読・当てる判断・読み直しのまとめを使い、自前の購読を持たない', () => {
    const source = readSource('src/ui/matches/use-live-matches.ts');

    expect(source).toMatch(/from\s+['"]@\/ui\/courts\/use-live-updates['"]/);
    expect(source).toMatch(/from\s+['"]@\/ui\/courts\/apply-live-change['"]/);
    expect(source).toMatch(/from\s+['"]@\/ui\/courts\/refresh-scheduler['"]/);
    expect(source).not.toMatch(/\.channel\(|getSupabaseBrowserClient|postgres_changes/);
  });

  test.each(PAGE_FILES)('%s は @/db/admin を import していない', (path) => {
    expect(readSource(path)).not.toMatch(/from\s+['"]@\/db\/admin['"]/);
  });
});
