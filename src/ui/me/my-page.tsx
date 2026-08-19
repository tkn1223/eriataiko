'use client';

import { Fragment, useState } from 'react';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/sample-data';

type Props = {
  profile: MyProfile;
  record: MyRecord;
  matches: MyMatch[];
};

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<MyProfile['teamNumber'], string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

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
  // 名前の保存先がまだ無いので、押されたら「準備中」と出すだけにしている
  const [renameNoticeShown, setRenameNoticeShown] = useState(false);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setRenameNoticeShown(true)}
          className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-bold"
        >
          名前を変更
        </button>
      </div>
      {renameNoticeShown && (
        <p role="status" className="mb-4 text-right text-sm font-bold text-gray-500">
          準備中
        </p>
      )}

      <div className="mb-5 flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex size-16 shrink-0 items-center justify-center rounded-full text-[26px] font-black text-white ${TEAM_BG_CLASS[profile.teamNumber]}`}
        >
          {profile.name.charAt(0)}
        </div>
        {/* 長い名前でも横にはみ出さず折り返すよう min-w-0 を付ける */}
        <div className="min-w-0">
          <p className="text-[22px] font-black break-words">{profile.name}</p>
          <p className="text-[13px] font-bold break-words text-gray-500">
            {profile.teamName} ・ {profile.classLabel}
          </p>
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

      {/* 390px 幅では 1 行に収まらない（実測）。truncate だと「とペア」「2部」が必ず
          消えてしまうので、2 行まで折り返して見せる。
          折り返しは「・」の区切りでだけ起こす（意味のかたまりの途中で折れると崩れて見える）。 */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[11px] font-bold text-gray-500">
          {/* 区切りの「・」だけを span の外に置く。中で改行されないよう nowrap にすると、
              span の中にある空白では折り返せなくなるため。 */}
          <span className="whitespace-nowrap">{match.roundLabel}</span>
          {' ・ '}
          <span className="whitespace-nowrap">
            {match.partnerName ? `${match.partnerName} とペア` : 'シングルス'}
          </span>
          {' ・ '}
          <span className="whitespace-nowrap">{match.classLabel}</span>
        </p>
        <p className="line-clamp-2 text-[14.5px] font-extrabold">
          {'vs '}
          {match.opponentNames.map((name, index) => (
            <Fragment key={name}>
              {index > 0 && '・'}
              <span className="whitespace-nowrap">{name}</span>
            </Fragment>
          ))}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {match.status === 'waiting' ? (
          <p className="tabular text-[11px] font-bold text-gray-500">
            コート{match.courtNumber}・{match.orderInCourt}試合目
          </p>
        ) : (
          <>
            <p className="tabular text-[17px] font-extrabold">
              {match.gamesWon}-{match.gamesLost}
            </p>
            <p className="tabular text-[11px] font-bold text-gray-500">
              {match.gameScores?.map(([won, lost]) => `${won}-${lost}`).join(' / ')}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
