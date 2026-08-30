import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * `/courts` は DB につながった（`createSupabaseServerClient()` で読む）ので、
 * もう「DB を読まない」見張りではない。
 *
 * ここで見張るのは **`getSupabaseAdminClient()`（`src/db/admin.ts`）を使っていないこと**。
 * admin クライアントは RLS を無視するので、画面（Server Component）から呼ぶと
 * 公開ページに秘密のデータを載せてしまう（AGENTS.md の「破ってはいけない 2 番目」）。
 */
const SOURCE_FILES = [
  'src/app/(app)/courts/page.tsx',
  // 画面のための読み取りそのもの。ここが admin に変わると気づけないので一緒に見張る。
  'src/db/courts.ts',
  'src/usecases/build-courts-view.ts',
  'src/ui/courts/courts-page.tsx',
  'src/ui/courts/sample-data.ts',
  'src/ui/courts/court-live-card.tsx',
  'src/ui/courts/types.ts',
  'src/ui/courts/use-live-scores.ts',
];

describe('/courts の画面', () => {
  test('src/db/admin.ts を import していない', () => {
    for (const path of SOURCE_FILES) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');

      expect(source, path).not.toMatch(/from\s+['"](@\/db\/admin|.*src\/db\/admin)['"]/);
    }
  });
});
