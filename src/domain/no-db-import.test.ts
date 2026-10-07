import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * src/domain/README.md の約束（「ここには計算だけを置く。DB も画面も HTTP も触らない」）を
 * 機械で見張る。src/ui/courts/no-db-import.test.ts と同じやり方。
 *
 * うっかり `@/db` や `@/ui` を import すると、domain が「一番バグると困る場所」で
 * なくなり、DB がないと動かせない・画面の都合に引っぱられるコードになってしまう。
 */
const DOMAIN_DIR = join(process.cwd(), 'src/domain');

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('src/domain', () => {
  test('@/db も @/ui も import していない', () => {
    for (const path of listSourceFiles(DOMAIN_DIR)) {
      const source = readFileSync(path, 'utf8');

      expect(source, path).not.toMatch(/from\s+['"](@\/db|@\/ui|.*src\/db|.*src\/ui)\//);
    }
  });
});
