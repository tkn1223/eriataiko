'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Block, BlockTitle, Button, List, ListInput, ListItem, Radio } from 'konsta/react';
import type { OperatorSession } from '@/server/session';
import type { Tables } from '@/types/database';

export type Operator = Pick<Tables<'operators'>, 'id' | 'name'>;

type Props = {
  operators: Operator[];
  passcodeRequired: boolean;
  session: OperatorSession | null;
};

/**
 * 入場 UI。
 *
 * ここで選んだ名前はあくまで「誰として入るか」の申告で、
 * 実際の検証（合言葉・運営者の実在確認・Cookie 発行）はすべて
 * /api/session の中でサーバーが行う。
 */
export function EntryGate({ operators, passcodeRequired, session }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const working = busy || pending;

  async function call(method: 'POST' | 'DELETE', body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/session', {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? '通信に失敗しました。');
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError('ネットワークに繋がりませんでした。電波を確認してください。');
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <>
        <BlockTitle>入場中</BlockTitle>
        <List strong inset>
          <ListItem title="名前" after={session.operatorName} />
        </List>
        <Block>
          <p className="mb-4 text-sm opacity-60">
            この端末からの書き込みは「{session.operatorName}」として記録されます。
            別の人に渡すときは退場してください。
          </p>
          <Button outline onClick={() => call('DELETE')} disabled={working}>
            退場する
          </Button>
        </Block>
      </>
    );
  }

  return (
    <>
      <BlockTitle>あなたは誰ですか？</BlockTitle>
      {operators.length === 0 ? (
        <Block strong inset>
          <p className="text-sm">
            運営者がまだ登録されていません。Supabase の <code>operators</code>{' '}
            テーブルに名前を追加してください。
          </p>
        </Block>
      ) : (
        <List strong inset>
          {operators.map((operator) => (
            <ListItem
              key={operator.id}
              label
              title={operator.name}
              media={
                <Radio
                  component="div"
                  value={operator.id}
                  checked={selectedId === operator.id}
                  onChange={() => setSelectedId(operator.id)}
                />
              }
            />
          ))}
        </List>
      )}

      {passcodeRequired && (
        <>
          <BlockTitle>合言葉</BlockTitle>
          <List strong inset>
            <ListInput
              type="password"
              placeholder="当日配布された合言葉"
              value={passcode}
              onChange={(e) => setPasscode((e.target as HTMLInputElement).value)}
              autoComplete="one-time-code"
            />
          </List>
        </>
      )}

      {error && (
        <Block>
          <p className="text-live text-sm font-bold">{error}</p>
        </Block>
      )}

      <Block>
        <Button
          large
          disabled={!selectedId || working}
          onClick={() => call('POST', { operatorId: selectedId, passcode })}
        >
          入場する
        </Button>
      </Block>
    </>
  );
}
