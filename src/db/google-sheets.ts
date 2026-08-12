import 'server-only';

import { importPKCS8, SignJWT } from 'jose';
import { serverEnv } from '@/config/env.server';
import type { SheetValues } from '@/usecases/build-snapshot';

/**
 * Google スプレッドシートへの読み書き。
 *
 * `googleapis` パッケージは使わない（大きく、起動が遅くなるため）。
 * 代わりに `jose`（セッションの署名で既に使っている）でサービスアカウントの
 * 秘密鍵に RS256 で署名し、アクセストークンに交換してから
 * Sheets の REST API を `fetch` で直接叩く。
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function sheetsApiUrl(path: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${path}`;
}

/** バックアップに必要な環境変数が揃っているか確認し、揃っていなければ日本語で落とす。 */
function requireGoogleConfig() {
  const env = serverEnv();
  const missing = [
    ['GOOGLE_SERVICE_ACCOUNT_EMAIL', env.GOOGLE_SERVICE_ACCOUNT_EMAIL],
    ['GOOGLE_PRIVATE_KEY', env.GOOGLE_PRIVATE_KEY],
    ['BACKUP_SPREADSHEET_ID', env.BACKUP_SPREADSHEET_ID],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  // どれが足りないかを名前で言う。当日「500 になったが原因が分からない」を避けるため。
  if (missing.length > 0) {
    throw new Error(
      `Google スプレッドシートの設定が未設定です（${missing.join(' / ')}）。docs/backup.md を参照してください。`
    );
  }

  return {
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY,
    spreadsheetId: env.BACKUP_SPREADSHEET_ID,
  };
}

/**
 * `GOOGLE_PRIVATE_KEY` を PEM として読める形に直してから鍵にする。
 *
 * 環境変数に貼ると改行が `\n` という 2 文字（バックスラッシュ + n）に化けることが多い。
 * PEM は本物の改行が無いと鍵として読めず、RS256 の署名が必ず失敗するので実際の改行に戻す。
 * JSON からのコピーで前後に `"` が付いてくる事故も多いので、そこも落とす。
 */
async function importPrivateKey(privateKey: string) {
  const pem = privateKey.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  try {
    return await importPKCS8(pem, 'RS256');
  } catch {
    // 元の例外は「Invalid PKCS8」程度しか言わないので、直し方が分かる文言に置き換える。
    // 鍵そのものは絶対にログにも例外にも載せない。
    throw new Error(
      'GOOGLE_PRIVATE_KEY を鍵として読めませんでした。JSON ファイルの private_key の値が、' +
        '-----BEGIN PRIVATE KEY----- から始まって最後まで欠けずに入っているか確認してください（docs/backup.md）。'
    );
  }
}

/**
 * サービスアカウントの秘密鍵で署名した JWT を、Google のアクセストークンに交換する。
 */
async function getAccessToken(): Promise<string> {
  const { email, privateKey } = requireGoogleConfig();

  const key = await importPrivateKey(privateKey);

  // sub（setSubject）は付けない。Google のサービスアカウント認証では sub は
  // 「別のユーザーになりすまして使う」ときだけの項目で、自分のアドレスを入れると
  // unauthorized_client で必ず弾かれる。
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google の認証に失敗しました（${response.status}）。サービスアカウントの設定を確認してください。`
    );
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Google がアクセストークンを返しませんでした。');
  }
  return body.access_token;
}

async function sheetsFetch(path: string, init: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken();
  const response = await fetch(sheetsApiUrl(path), {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Google スプレッドシートへのアクセスに失敗しました（${response.status}）。${detail}`
    );
  }

  return response;
}

export type SheetTab = { sheetId: number; title: string };

/** スプレッドシートにある全タブを、並び順（= 作成順）のまま返す。 */
export async function listSheetTabs(): Promise<SheetTab[]> {
  const { spreadsheetId } = requireGoogleConfig();
  const response = await sheetsFetch(
    `${spreadsheetId}?fields=sheets.properties(sheetId,title,index)`,
    { method: 'GET' }
  );
  const body = (await response.json()) as {
    sheets?: { properties: { sheetId: number; title: string; index: number } }[];
  };

  return (body.sheets ?? [])
    .map((sheet) => sheet.properties)
    .sort((a, b) => a.index - b.index)
    .map(({ sheetId, title }) => ({ sheetId, title }));
}

/** 新しいタブを作り、内容を書き込む。 */
export async function createTabWithValues(title: string, values: SheetValues): Promise<void> {
  const { spreadsheetId } = requireGoogleConfig();

  await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });

  // セルに書けない値（undefined）が紛れると Sheets 側で弾かれるため、空文字にそろえる。
  const rows = values.map((row) => row.map((cell) => cell ?? ''));

  // 書き込み先の指定（A1 記法）では、タブ名を単引用符で囲む。`10-15` のように
  // 数字で始まって記号を含む名前は、囲まないと範囲として解釈できず 400 になる。
  // 名前に含まれる `'` は 2 つ重ねて打ち消す。
  const range = `'${title.replace(/'/g, "''")}'!A1`;

  await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows }),
  });
}

/** 指定した sheetId のタブをまとめて消す。 */
export async function deleteTabs(sheetIds: number[]): Promise<void> {
  if (sheetIds.length === 0) return;
  const { spreadsheetId } = requireGoogleConfig();

  await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: sheetIds.map((sheetId) => ({ deleteSheet: { sheetId } })),
    }),
  });
}
