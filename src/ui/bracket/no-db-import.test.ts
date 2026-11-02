import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 *
 * `src/ui/bracket/*.tsx`（部品）は `@/db` を一切 import しない。
 * `page.tsx` は読み取りに `createSupabaseServerClient()`（`src/db/bracket.ts` の中）を使ってよいが、
 * `getSupabaseAdminClient()`（`@/db/admin`）は使わない
 * （AGENTS.md の「破ってはいけない 3 つ」の 2 番目。結果LIVE と同じ見張り方。src/ui/courts/no-db-import.test.ts）。
 */
const UI_COMPONENT_FILES = [
  'src/ui/bracket/bracket-page.tsx',
  'src/ui/bracket/league-matrix.tsx',
  'src/ui/bracket/standings-table.tsx',
  'src/ui/bracket/ko-bracket.tsx',
  'src/ui/bracket/card-detail-sheet.tsx',
];

const PAGE_FILE = 'src/app/(app)/bracket/page.tsx';

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('/bracket の画面', () => {
  test.each(UI_COMPONENT_FILES)('%s は @/db を import していない', (path) => {
    const source = readSource(path);
    expect(source).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
  });

  test('page.tsx は @/db/admin を import していない', () => {
    const source = readSource(PAGE_FILE);
    expect(source).not.toMatch(/from\s+['"]@\/db\/admin['"]/);
  });
});
