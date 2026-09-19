import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 *
 * `src/ui/courts/*.tsx`（部品）は `@/db` を一切 import しない。
 * `page.tsx` は読み取りに `createSupabaseServerClient()` を使ってよいが、
 * `getSupabaseAdminClient()`（`@/db/admin`）は使わない
 * （AGENTS.md の「破ってはいけない 3 つ」の 2 番目。`/me` と同じ見張り方。src/ui/me/no-db-import.test.ts）。
 */
const UI_COMPONENT_FILES = [
  'src/ui/courts/courts-page.tsx',
  'src/ui/courts/court-live-card.tsx',
  'src/ui/courts/finish-confirm-sheet.tsx',
  // 送る・送り直す仕組み（use-score-sync.ts）は Route Handler 宛の fetch だけを使う。
  // Supabase の画面側の鍵でも書かない（AGENTS.md の「破ってはいけない 3 つ」の 1 番目）。
  'src/ui/courts/use-score-sync.ts',
  'src/ui/courts/save-retry-policy.ts',
];

const PAGE_FILE = 'src/app/(app)/courts/page.tsx';

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('/courts の画面', () => {
  test.each(UI_COMPONENT_FILES)('%s は @/db を import していない', (path) => {
    const source = readSource(path);
    expect(source).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
  });

  test('page.tsx は @/db/admin を import していない', () => {
    const source = readSource(PAGE_FILE);
    expect(source).not.toMatch(/from\s+['"]@\/db\/admin['"]/);
  });
});
