import { describe, expect, test } from 'vitest';
import { POST } from '@/app/api/backup/route';
import { BACKUP_SECRET_HEADER } from '@/config/backup';

/**
 * 秘密のヘッダーの照合だけを確かめる。
 *
 * ヘッダーが通らないケースは Supabase も Google も触る前に返るので、
 * 外に繋がずにテストできる。`.env.test` の BACKUP_SECRET=test-backup-secret が前提。
 *
 * 「正しいヘッダーで叩くとタブができる」以降は本物のスプレッドシートが必要なため、
 * docs/backup.md の手順で人が確かめる（仕様の受け入れ基準どおり）。
 */
function backupRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/backup', { method: 'POST', headers });
}

describe('バックアップ API は秘密のヘッダーで守られている', () => {
  test('秘密のヘッダーが無いと 401 が返る', async () => {
    const response = await POST(backupRequest());
    expect(response.status).toBe(401);
  });

  test('秘密のヘッダーが違う値だと 401 が返る', async () => {
    const response = await POST(backupRequest({ [BACKUP_SECRET_HEADER]: 'wrong-secret' }));
    expect(response.status).toBe(401);
  });

  test('長さが違う値でも 500 にならず 401 が返る（定数時間比較が例外を投げないこと）', async () => {
    const response = await POST(backupRequest({ [BACKUP_SECRET_HEADER]: 'x' }));
    expect(response.status).toBe(401);
  });

  test('401 のときは理由が日本語で返る', async () => {
    const response = await POST(backupRequest());
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('秘密のヘッダー');
  });
});
