import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 *
 * `src/ui/me/*.tsx`（部品）は `@/db` を一切 import しない。
 * `page.tsx` は読み取りに `createSupabaseServerClient()` を使ってよいが、
 * `getSupabaseAdminClient()`（`@/db/admin`）は使わない
 * （AGENTS.md の「破ってはいけない 3 つ」の 2 番目）。
 */
const UI_COMPONENT_FILES = ['src/ui/me/my-page.tsx', 'src/ui/me/viewer-notice.tsx'];

const PAGE_FILE = 'src/app/(app)/me/page.tsx';

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('/me の画面', () => {
  test.each(UI_COMPONENT_FILES)('%s は @/db を import していない', (path) => {
    const source = readSource(path);
    expect(source).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
  });

  test('page.tsx は @/db/admin を import していない', () => {
    const source = readSource(PAGE_FILE);
    expect(source).not.toMatch(/from\s+['"]@\/db\/admin['"]/);
  });
});
