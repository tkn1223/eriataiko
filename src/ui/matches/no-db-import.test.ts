import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * この段では DB を読まない（試合を保存する表がまだ無い）。
 * うっかり Server Component から DB を触ると、公開ページに出してはいけない値を
 * 載せてしまうことがあるので、import そのものが無いことを機械で見張る。
 */
const SOURCE_FILES = [
  'src/app/(app)/matches/page.tsx',
  'src/ui/matches/matches-page.tsx',
  'src/ui/matches/sample-data.ts',
  'src/ui/matches/court-card.tsx',
  'src/ui/matches/match-row.tsx',
  'src/ui/matches/score-sheet.tsx',
];

describe('/matches の画面', () => {
  test('src/db/ を import していない', () => {
    for (const path of SOURCE_FILES) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');

      expect(source, path).not.toMatch(/from\s+['"](@\/db|.*src\/db|\.{1,2}\/.*\/db)\//);
    }
  });
});
