import type { SendResult } from '@/ui/courts/save-retry-policy';

/** 応答の本文から日本語のエラーメッセージ（`{ error: string }`）を取り出す。取れなければ null。 */
async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // 本文が JSON でない・空のときは既定文言（save-retry-policy.ts）に任せる
  }
  return null;
}

/**
 * 保存の入口（`/api/**` の Route Handler）へ 1 回送り、結果を `SendResult` の形にして返す。
 * **画面側の Supabase クライアントでは書かない**（AGENTS.md の「破ってはいけない 3 つ」の 1）。
 * 点の保存・試合の終了・終了の取り消しがここを通る。送り直すかの判断は呼び出し側
 * （`save-retry-policy.ts`）。
 */
export async function sendRequest(request: {
  url: string;
  method: 'POST' | 'DELETE';
  body?: unknown;
}): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      ...(request.body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body),
          }),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }

  if (response.ok) return { ok: true };
  const message = await readErrorMessage(response);
  return { ok: false, kind: 'http', status: response.status, message };
}
