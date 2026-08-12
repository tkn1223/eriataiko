import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { serverEnv } from '@/config/env.server';

/**
 * env.server.ts は「スキーマ」と「process.env から渡す一覧」を別々に書いている。
 * 片方だけ書き足すと、その変数は**未設定エラーにならず静かに既定値（空文字）になる**。
 * 本番でだけ機能が動かず、ログにも何も出ないので気づきにくい。
 * 一度実際にこれが起きたので、渡し忘れをここで捕まえる。
 */
describe('サーバーの環境変数は process.env から読まれている', () => {
  beforeAll(() => {
    // serverEnv() は最初に呼ばれたときの値を覚えるので、読む前に差し替える。
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'backup@example.gserviceaccount.com');
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----dummy');
    vi.stubEnv('BACKUP_SPREADSHEET_ID', 'dummy-spreadsheet-id');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test('BACKUP_SECRET が読めている（.env.test の値）', () => {
    expect(serverEnv().BACKUP_SECRET).toBe('test-backup-secret');
  });

  test('Google のバックアップ用の 3 つが読めている', () => {
    const env = serverEnv();
    expect(env.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBe('backup@example.gserviceaccount.com');
    expect(env.GOOGLE_PRIVATE_KEY).toBe('-----BEGIN PRIVATE KEY-----dummy');
    expect(env.BACKUP_SPREADSHEET_ID).toBe('dummy-spreadsheet-id');
  });
});
