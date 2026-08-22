'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Block, BlockTitle, Button, List, ListInput, ListItem, Radio } from 'konsta/react';
import type { OperatorSession } from '@/server/session';

/** 入場画面の一覧に出す 1 人。いまの大会に参加している人だけが来る。 */
export type Entrant = {
  entryId: string;
  playerId: string;
  /** 同名（「たろう」が複数いる）を見分けるための番号 */
  number: number;
  name: string;
  canInput: boolean;
};

type Props = {
  entrants: Entrant[];
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
export function EntryGate({ entrants, passcodeRequired, session }: Props) {
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
          <ListItem title="名前" after={`${session.playerName} #${session.playerNumber}`} />
        </List>
        <Block>
          <p className="mb-4 text-sm opacity-60">
            この端末からの書き込みは「{session.playerName}」として記録されます。
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
      {entrants.length === 0 ? (
        <Block strong inset>
          <p className="text-sm">
            参加者がまだ登録されていません。今の大会（<code>competitions</code> の{' '}
            <code>is_current</code>）と、その参加者（<code>entries</code>）を登録してください。
          </p>
        </Block>
      ) : (
        <List strong inset>
          {entrants.map((entrant) => (
            <ListItem
              key={entrant.playerId}
              label
              title={entrant.name}
              // 同じニックネームの人がいるので、番号を添えないと選び分けられない
              after={`#${entrant.number}`}
              media={
                <Radio
                  component="div"
                  value={entrant.playerId}
                  checked={selectedId === entrant.playerId}
                  onChange={() => setSelectedId(entrant.playerId)}
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
              // **伏せ字にしない。** 端末によっては伏せ字の欄で日本語入力（IME）が
              // 切られ、日本語の合言葉を打てない。見えていれば濁点が正しく入ったかも
              // 自分で確かめられる。合言葉は大会共通で、個人の秘密ではない。
              type="text"
              placeholder="当日配布された合言葉"
              value={passcode}
              onChange={(e) => setPasscode((e.target as HTMLInputElement).value)}
              // one-time-code は SMS で届く数字コード用の指定で、iPhone では
              // 数字キーパッドが出てしまう。ここは SMS コードではないので使わない。
              autoComplete="off"
              // 勝手に大文字にしたり、綴りを直したりさせない
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
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
          onClick={() => call('POST', { playerId: selectedId, passcode })}
        >
          入場する
        </Button>
      </Block>
    </>
  );
}
