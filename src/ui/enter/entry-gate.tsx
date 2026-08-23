'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BottomSheet } from '@/ui/components/bottom-sheet';
import type { Session } from '@/server/session';

/** 入場画面の一覧に出す 1 人。いまの大会に参加している人だけが来る。 */
export type Entrant = {
  entryId: string;
  playerId: string;
  /** 同名（「たろう」が複数いる）を見分けるための番号 */
  number: number;
  name: string;
  canInput: boolean;
  /** 試合に出ない入力係はチームも部も無い */
  teamId: string | null;
  divisionId: string | null;
};

export type EnterTeam = { id: string; number: number; name: string };
export type EnterDivision = { id: string; name: string };

type Props = {
  competitionName: string;
  entrants: Entrant[];
  teams: EnterTeam[];
  divisions: EnterDivision[];
  passcodeRequired: boolean;
  session: Session | null;
};

/** チームが決まっていない人（試合に出ない入力係など）の置き場を指す目印。 */
const NO_TEAM = '__no_team__';

/** チーム番号 → 縦棒の色（globals.css の --color-team-1〜4）。 */
const TEAM_BAR_CLASS: Record<number, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/** 5 チーム目からは色が足りないので、色を付けずに枠線と同じ薄い色にする。 */
function teamBarClass(teamNumber: number | null) {
  if (teamNumber === null) return 'bg-hairline';
  return TEAM_BAR_CLASS[teamNumber] ?? 'bg-hairline';
}

/**
 * 部の色。**名前ではなく、その大会での並び順で引く。**
 * 部の呼び名は大会ごとに変わる（「1部」が「A級」になる）ので、
 * 名前で決めると次の大会で色が付かなくなる。
 *
 * チームをまたいで同じ部が同じ色になるよう、番号は**大会の部の並び**から取る。
 */
const DIVISION_DOT_CLASS = [
  'bg-class-1',
  'bg-class-2',
  'bg-class-3',
  'bg-class-4',
  'bg-class-5',
  'bg-class-6',
];

type Bucket = {
  key: string;
  teamNumber: number | null;
  name: string;
  members: Entrant[];
};

/**
 * チームごとの束を作る。人が 1 人もいないチームは出さない
 * （押しても誰も出てこないカードで行き止まりにならないように）。
 */
function buildBuckets(entrants: Entrant[], teams: EnterTeam[]): Bucket[] {
  const buckets: Bucket[] = teams
    .map((team) => ({
      key: team.id,
      teamNumber: team.number,
      name: team.name,
      members: entrants.filter((entrant) => entrant.teamId === team.id),
    }))
    .filter((bucket) => bucket.members.length > 0);

  const withoutTeam = entrants.filter((entrant) => entrant.teamId === null);
  if (withoutTeam.length > 0) {
    buckets.push({ key: NO_TEAM, teamNumber: null, name: 'チームなし', members: withoutTeam });
  }

  return buckets;
}

type Group = { key: string; colorIndex: number; name: string | null; members: Entrant[] };

/** 選んだチームの中を部ごとに分ける。部が無い人は見出しなしで最後にまとめる。 */
function buildGroups(members: Entrant[], divisions: EnterDivision[]): Group[] {
  const groups: Group[] = divisions
    .map((division, index) => ({
      key: division.id,
      // チームをまたいで「1部」が同じ色になるよう、大会の部の並びから取る
      colorIndex: index,
      name: division.name,
      members: members.filter((member) => member.divisionId === division.id),
    }))
    .filter((group) => group.members.length > 0);

  const withoutDivision = members.filter((member) => member.divisionId === null);
  if (withoutDivision.length > 0) {
    groups.push({
      key: '__no_division__',
      colorIndex: -1,
      name: null,
      members: withoutDivision,
    });
  }

  return groups;
}

/**
 * 入場 UI。
 *
 * 見た目は運用中のアプリ（badminton-app）の入場画面に合わせてある
 * （`docs/specs/2026-08-23-enter-screen.md` に実測値）。流れは
 *
 *   チームを選ぶ → 名前をタップ → 合言葉 → 入場
 *
 * **チーム分けの無い大会では、チームを選ぶ画面ごと出さない。**
 * 参加の記録にチームが入っていなければ束が 1 つになるので、そのまま名前が並ぶ。
 *
 * 見るだけの人は、最初の画面の一番下から**合言葉なしで**入れる。
 *
 * ここで選んだ名前はあくまで「誰として入るか」の申告で、
 * 実際の検証（合言葉・参加者の実在確認・Cookie 発行）はすべて
 * /api/session の中でサーバーが行う。
 */
export function EntryGate({
  competitionName,
  entrants,
  teams,
  divisions,
  passcodeRequired,
  session,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [teamKey, setTeamKey] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Entrant | null>(null);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const working = busy || pending;

  const buckets = buildBuckets(entrants, teams);
  // **束が 1 つしか無いなら、チームを選ぶ画面ごと出さない。**
  // チーム分けの無い大会では全員がチームなしになるので、ここが 1 つになる。
  const teamStepShown = buckets.length > 1;
  const bucket = teamStepShown
    ? (buckets.find((b) => b.key === teamKey) ?? null)
    : (buckets[0] ?? null);

  // 観戦者のボタンは「最初に開いた画面」の一番下に置く。
  // チーム選びを出さないときも、置き去りにしない。
  const onFirstScreen = bucket === null || !teamStepShown;

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
      setChosen(null);
      setPasscode('');
      startTransition(() => router.refresh());
    } catch {
      setError('ネットワークに繋がりませんでした。電波を確認してください。');
    } finally {
      setBusy(false);
    }
  }

  /** 名前を押したとき。合言葉が要らない設定ならシートを出さずそのまま入る。 */
  function choose(entrant: Entrant) {
    setError(null);
    if (!passcodeRequired) {
      void call('POST', { as: 'player', playerId: entrant.playerId, passcode: '' });
      return;
    }
    setPasscode('');
    setChosen(entrant);
  }

  return (
    <div className="bg-paper text-ink min-h-dvh">
      <div className="mx-auto max-w-md px-4 pt-8 pb-16">
        <p className="text-muted-ink text-[11px] font-extrabold tracking-[0.28em]">
          BADMINTON TOURNAMENT
        </p>
        <h1 className="mt-1 text-[22px] leading-[1.6] font-black">{competitionName}</h1>

        <div className="mt-6">
          {session ? (
            <EnteredView session={session} working={working} onLeave={() => call('DELETE')} />
          ) : entrants.length === 0 ? (
            <EmptyView />
          ) : bucket === null ? (
            <TeamStep buckets={buckets} onChoose={setTeamKey} disabled={working} />
          ) : (
            <NameStep
              bucket={bucket}
              divisions={divisions}
              backShown={teamStepShown}
              onBack={() => setTeamKey(null)}
              onChoose={choose}
              disabled={working}
            />
          )}
        </div>

        {session === null && onFirstScreen && (
          <button
            type="button"
            disabled={working}
            onClick={() => call('POST', { as: 'viewer' })}
            className="border-hairline text-muted-ink mt-4 min-h-12 w-full rounded-xl border border-dashed text-[13px] font-bold disabled:opacity-50"
          >
            観戦の方はこちら（合言葉なし・見るだけ）
          </button>
        )}

        {/* シートの外で起きた失敗（観戦・退場・合言葉なしの入場）はここに出す */}
        {error && chosen === null && (
          <p role="alert" className="text-live mt-4 text-[13px] font-bold">
            {error}
          </p>
        )}
      </div>

      <BottomSheet
        open={chosen !== null}
        labelledBy="passcode-heading"
        header={
          <h2 id="passcode-heading" className="text-[17px] font-black">
            {chosen?.name}
            <span className="text-muted-ink tabular ml-2 text-[13px] font-bold">
              #{chosen?.number}
            </span>
          </h2>
        }
        onClose={() => setChosen(null)}
      >
        <p className="text-muted-ink text-[13px]">当日配布された合言葉を入れてください。</p>

        <input
          // **伏せ字にしない。** 端末によっては伏せ字の欄で日本語入力（IME）が
          // 切られ、日本語の合言葉を打てない。見えていれば濁点が正しく入ったかも
          // 自分で確かめられる。合言葉は大会共通で、個人の秘密ではない。
          type="text"
          placeholder="当日配布された合言葉"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          // one-time-code は SMS で届く数字コード用の指定で、iPhone では
          // 数字キーパッドが出てしまう。ここは SMS コードではないので使わない。
          autoComplete="off"
          // 勝手に大文字にしたり、綴りを直したりさせない
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && chosen && !working) {
              void call('POST', { as: 'player', playerId: chosen.playerId, passcode });
            }
          }}
          // 16px より小さいと iPhone が勝手に画面を拡大する。
          // 既定の青い枠はこのアプリのどこにも出てこない色なので、濃い色に置き換える
          // （枠を消すのではなく、どこを触っているか分かる状態は残す）。
          className="border-hairline focus:border-ink focus:outline-ink/30 mt-3 min-h-12 w-full rounded-xl border px-3 text-[16px] focus:outline-2"
        />

        {error && (
          <p role="alert" className="text-live mt-3 text-[13px] font-bold">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={working}
          onClick={() =>
            chosen && call('POST', { as: 'player', playerId: chosen.playerId, passcode })
          }
          className="bg-ink mt-4 min-h-12 w-full rounded-xl text-[15px] font-extrabold text-white disabled:opacity-50"
        >
          入場する
        </button>
      </BottomSheet>
    </div>
  );
}

function EnteredView({
  session,
  working,
  onLeave,
}: {
  session: Session;
  working: boolean;
  onLeave: () => void;
}) {
  const viewing = session.role === 'viewer';

  return (
    <>
      <h2 className="text-[17px] font-black">{viewing ? '観戦中' : '入場中'}</h2>
      <div className="border-hairline mt-3 rounded-2xl border bg-white p-[18px]">
        {viewing ? (
          <p className="text-[18px] font-black">観戦者</p>
        ) : (
          <p className="text-[18px] font-black">
            {session.playerName}
            <span className="text-muted-ink tabular ml-2 text-[13px] font-bold">
              #{session.playerNumber}
            </span>
          </p>
        )}
        <p className="text-muted-ink mt-2 text-[13px] leading-relaxed">
          {viewing
            ? '見るだけの状態です。得点の書き込みはできません。自分の試合を見るときは、いったんやめて名前を選んでください。'
            : `この端末からの書き込みは「${session.playerName}」として記録されます。別の人に渡すときは退場してください。`}
        </p>
      </div>
      {/* ここまで来たら用は済んでいる。行き先が無いと URL を打ち直すことになる。 */}
      <Link
        href="/"
        className="bg-ink mt-4 flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold text-white"
      >
        大会の画面へ
      </Link>
      <button
        type="button"
        onClick={onLeave}
        disabled={working}
        className="border-hairline mt-3 min-h-12 w-full rounded-xl border bg-white text-[15px] font-extrabold disabled:opacity-50"
      >
        {viewing ? '観戦をやめる' : '退場する'}
      </button>
    </>
  );
}

function EmptyView() {
  return (
    <div className="border-hairline rounded-2xl border bg-white p-[18px]">
      <p className="text-[13px] leading-relaxed">
        参加者がまだ登録されていません。今の大会（<code>competitions</code> の{' '}
        <code>is_current</code>）と、その参加者（<code>entries</code>）を登録してください。
      </p>
    </div>
  );
}

function TeamStep({
  buckets,
  onChoose,
  disabled,
}: {
  buckets: Bucket[];
  onChoose: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <h2 className="text-[17px] font-black">あなたのチームを選んでください</h2>
      <div className="mt-3 flex flex-col gap-[10px]">
        {buckets.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(bucket.key)}
            className="border-hairline flex h-[72px] w-full items-center gap-3 rounded-2xl border bg-white px-[18px] text-left disabled:opacity-50"
          >
            <span
              aria-hidden="true"
              className={`h-[34px] w-[10px] shrink-0 rounded-[6px] ${teamBarClass(bucket.teamNumber)}`}
            />
            <span className="min-w-0 flex-1 truncate text-[18px] font-black">{bucket.name}</span>
            <span className="text-muted-ink tabular shrink-0 text-[13px] font-bold">
              {bucket.members.length}名
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function NameStep({
  bucket,
  divisions,
  backShown,
  onBack,
  onChoose,
  disabled,
}: {
  bucket: Bucket;
  divisions: EnterDivision[];
  backShown: boolean;
  onBack: () => void;
  onChoose: (entrant: Entrant) => void;
  disabled: boolean;
}) {
  const groups = buildGroups(bucket.members, divisions);

  return (
    <>
      {backShown && (
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="border-hairline min-h-11 rounded-full border bg-white px-4 text-[13px] font-extrabold"
          >
            ← 戻る
          </button>
          <span className="flex min-w-0 items-center gap-2 text-[15px] font-black">
            <span
              aria-hidden="true"
              className={`h-[10px] w-[10px] shrink-0 rounded-full ${teamBarClass(bucket.teamNumber)}`}
            />
            <span className="truncate">{bucket.name}</span>
          </span>
        </div>
      )}

      <h2 className="text-[17px] font-black">あなたの名前をタップ</h2>

      {groups.map((group) => (
        <div key={group.key} className="mt-3">
          {group.name && (
            <p className="text-muted-ink mb-2 flex items-center gap-1.5 text-[12px] font-extrabold">
              <span
                aria-hidden="true"
                className={`h-[8px] w-[8px] shrink-0 rounded-full ${
                  DIVISION_DOT_CLASS[group.colorIndex] ?? 'bg-hairline'
                }`}
              />
              {group.name}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {group.members.map((entrant) => (
              <button
                key={entrant.playerId}
                type="button"
                disabled={disabled}
                onClick={() => onChoose(entrant)}
                className="border-hairline flex min-h-[51px] items-center justify-center gap-1 rounded-xl border bg-white px-2 py-[14px] text-[15px] font-extrabold disabled:opacity-50"
              >
                <span className="min-w-0 truncate">{entrant.name}</span>
                {/* 同じニックネームの人がいるので、番号が無いと選び分けられない */}
                <span className="text-muted-ink tabular shrink-0 text-[11px] font-bold">
                  #{entrant.number}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
