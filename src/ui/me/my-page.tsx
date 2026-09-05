import { Fragment } from 'react';
import Link from 'next/link';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/types';

type Props = {
  profile: MyProfile;
  record: MyRecord;
  matches: MyMatch[];
};

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<NonNullable<MyProfile['teamNumber']>, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/** チーム無しの参加者（入力係など）は灰色にする。 */
const NO_TEAM_BG_CLASS = 'bg-gray-400';

/**
 * 試合の状態を表す丸バッジ。
 * 勝ちだけ濃い背景にして、遠目でも勝敗が一目で分かるようにする。
 * label は読み上げ用（記号だけだと「白丸」などと読まれて意味が伝わらない）。
 */
const MATCH_BADGES = {
  won: { mark: '○', label: '勝ち', className: 'bg-gray-800 text-white' },
  lost: { mark: '●', label: '負け', className: 'bg-gray-200 text-gray-500' },
  live: { mark: 'LIVE', label: '進行中', className: 'bg-red-100 text-live' },
  waiting: { mark: '待', label: '未実施', className: 'bg-gray-200 text-gray-500' },
} as const;

/**
 * 未実施の試合の「コート◯・◯試合目」。
 * コートと順番は当日別々に決まるので、コートだけ決まっている途中の状態がありうる
 * （その間に「◯試合目」を出すと、数字が抜けた文になる）。
 */
function courtLabelOf(match: MyMatch): string {
  if (!match.courtNumber) return 'コート未定';
  if (!match.orderInCourt) return `コート${match.courtNumber}`;
  return `コート${match.courtNumber}・${match.orderInCourt}試合目`;
}

function badgeOf(match: MyMatch) {
  if (match.status === 'live') return MATCH_BADGES.live;
  if (match.status === 'waiting') return MATCH_BADGES.waiting;
  return match.won ? MATCH_BADGES.won : MATCH_BADGES.lost;
}

/**
 * 選手のマイページ。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 本物のデータをつなぐときは、渡す props を差し替えるだけでよい。
 */
export function MyPage({ profile, record, matches }: Props) {
  const avatarClass = profile.teamNumber ? TEAM_BG_CLASS[profile.teamNumber] : NO_TEAM_BG_CLASS;
  // チーム無しの参加者は部だけを出す（「・」だけ浮かないようにする）
  const subLine = [profile.teamName, profile.classLabel]
    .filter((value) => value !== null)
    .join(' ・ ');

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="mb-4 flex justify-end">
        <Link
          href="/enter"
          className="flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-bold"
        >
          別の人として入り直す
        </Link>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex size-16 shrink-0 items-center justify-center rounded-full text-[26px] font-black text-white ${avatarClass}`}
        >
          {profile.name.charAt(0)}
        </div>
        {/* 長い名前でも横にはみ出さず折り返すよう min-w-0 を付ける */}
        <div className="min-w-0">
          <p className="text-[22px] font-black break-words">{profile.name}</p>
          <p className="text-[13px] font-bold break-words text-gray-500">{subLine}</p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-[22px] py-[18px]">
        <p className="tabular text-[30px] font-black">
          {record.wins}勝{record.losses}敗
        </p>
        <div className="text-right text-[12.5px] font-bold text-gray-500">
          <p className="tabular">
            ゲーム {record.gamesWon}-{record.gamesLost}
          </p>
          <p className="tabular">
            得失点 {record.pointDiff >= 0 ? '+' : ''}
            {record.pointDiff}
          </p>
        </div>
      </div>

      <h2 className="mb-2 text-[13px] font-black tracking-[0.08em] text-gray-500">今大会の試合</h2>

      <ul className="flex flex-col gap-2">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </ul>
    </div>
  );
}

/**
 * 空白で区切った語ごとに折り返しを止める。
 *
 * かたまり全体を nowrap にすると、狭い画面（375px）で「五十嵐 十四郎 とペア」のような
 * 長いかたまりが枠に入りきらず、はみ出して切れる（実測）。語の間でだけ折り返せるようにすると、
 * 語の途中で折れないまま、入りきらないときは次の行へ回せる。
 *
 * 区切りは**空白の種類を問わない**。名簿には「五十嵐　十四郎」のように全角空白の名前もあり、
 * 半角空白だけで区切ると 1 かたまりのまま折り返せず、375px で「とペア」が切れる（実測）。
 * 空白そのものは元の文字のまま残す（見た目の幅が変わらないように）。
 */
function Words({ text }: { text: string }) {
  return text
    .split(/(\s+)/)
    .filter((part) => part !== '')
    .map((part, index) =>
      /^\s+$/.test(part) ? (
        <Fragment key={index}>{part}</Fragment>
      ) : (
        <span key={index} className="whitespace-nowrap">
          {part}
        </span>
      )
    );
}

function MatchCard({ match }: { match: MyMatch }) {
  const badge = badgeOf(match);

  return (
    <li
      data-testid={`match-${match.id}`}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-[14px] py-[11px]"
    >
      <span
        role="img"
        aria-label={badge.label}
        className={`flex size-[34px] shrink-0 items-center justify-center rounded-full font-black ${match.status === 'live' ? 'text-[10px]' : 'text-base'} ${badge.className}`}
      >
        {badge.mark}
      </span>

      {/* 375px / 390px 幅では 1 行に収まらない（実測）。truncate だと「とペア」「3部」が
          消えてしまうので、折り返して見せる。上の行は最大 3 行
          （「決勝トーナメント 準々決勝」のような長い回戦名と長い名前が重なると 3 行になる）。 */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 text-[11px] font-bold text-gray-500">
          <Words text={match.roundLabel} />
          {' ・ '}
          <Words text={match.partnerName ? `${match.partnerName} とペア` : 'シングルス'} />
          {' ・ '}
          <Words text={match.classLabel} />
        </p>
        <p className="line-clamp-2 text-[14.5px] font-extrabold">
          {'vs '}
          {/* 同姓同名は珍しくないので、名前ではなく並び順を key にする */}
          {match.opponentNames.map((name, index) => (
            <Fragment key={index}>
              {index > 0 && '・'}
              <Words text={name} />
            </Fragment>
          ))}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {match.status === 'waiting' ? (
          <p className="tabular text-[11px] font-bold text-gray-500">{courtLabelOf(match)}</p>
        ) : (
          <>
            {/* 進行中の試合はゲーム数が渡ってこない（決着していないゲームを数えられないため）。
                その場合は行ごと出さない。空の行を置くと「-」だけが残って誤解される。 */}
            {match.gamesWon !== undefined && match.gamesLost !== undefined && (
              <p data-testid="game-count" className="tabular text-[17px] font-extrabold">
                {match.gamesWon}-{match.gamesLost}
              </p>
            )}
            <p className="tabular text-[11px] font-bold text-gray-500">
              {match.gameScores?.map(([won, lost]) => `${won}-${lost}`).join(' / ')}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
