import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 * （`src/ui/courts/no-db-import.test.ts` と同じ見張り方）
 *
 * - `src/ui/matches/*`（部品）は `@/db` を一切 import しない。進行表は見るだけの画面で、書き込みも無い
 * - `page.tsx` は読み取りに `createSupabaseServerClient()` を使ってよいが、
 *   `getSupabaseAdminClient()`（`@/db/admin`）は使わない
 *   （AGENTS.md の「破ってはいけない 3 つ」の 2 番目）
 */
const UI_COMPONENT_FILES = [
  'src/ui/matches/matches-page.tsx',
  'src/ui/matches/court-card.tsx',
  'src/ui/matches/match-row.tsx',
  'src/ui/matches/derive-matches-courts.ts',
  'src/ui/matches/types.ts',
];

const PAGE_FILE = 'src/app/(app)/matches/page.tsx';

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('/matches の画面', () => {
  test.each(UI_COMPONENT_FILES)('%s は @/db を import していない', (path) => {
    expect(readSource(path)).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
  });

  // 書き込みは Route Handler 経由だけ（AGENTS.md の「破ってはいけない 3 つ」の 1 番目）。
  // 進行表は見るだけなので、部品のどこでも Supabase の表を直接触らず、fetch で書き込みもしない。
  test.each(UI_COMPONENT_FILES)(
    '%s は Supabase の表を直接触らず、書き込みの fetch もしない',
    (path) => {
      const source = readSource(path);
      expect(source).not.toMatch(/\.from\(\s*['"`]|\.rpc\(/);
      expect(source).not.toMatch(/\bfetch\(/);
    }
  );

  test('page.tsx は @/db/admin を import していない', () => {
    expect(readSource(PAGE_FILE)).not.toMatch(/from\s+['"]@\/db\/admin['"]/);
  });
});
