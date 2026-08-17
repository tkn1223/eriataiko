import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * この段では DB を読まない(チーム・試合を保存する表がまだ無い)。
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 */
const SOURCE_FILES = [
  'src/app/(app)/bracket/page.tsx',
  'src/ui/bracket/bracket-page.tsx',
  'src/ui/bracket/sample-data.ts',
  'src/ui/bracket/league-matrix.tsx',
  'src/ui/bracket/standings-table.tsx',
  'src/ui/bracket/ko-bracket.tsx',
  'src/ui/bracket/card-detail-sheet.tsx',
];

describe('/bracket の画面', () => {
  test('src/db/ を import していない', () => {
    for (const path of SOURCE_FILES) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');

      expect(source, path).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
    }
  });
});
