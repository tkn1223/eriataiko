import { Fragment } from 'react';
import { RetiredNote } from '@/ui/components/retired-note';
import { ReenterButton } from '@/ui/enter/reenter-button';
import { NavbarSubtitle } from '@/ui/navbar-subtitle';
import {
  classColorClasses,
  hasTeamColor,
  teamBgClass,
  type ClassLabel,
} from '@/domain/class-labels';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/types';

type Props = {
  profile: MyProfile;
  /** 終わった試合の勝敗。見出しの右と「全試合が終わりました」に出す */
  record: MyRecord;
  /** 終わっていない試合（試合中＋未実施）の数。試合中は matches に入らないので別に受ける */
  remainingCount: number;
  /** 未実施（近い順）→ 終了。試合中は入っていない */
  matches: MyMatch[];
};

/** 試合速報（court-live-card.tsx）と揃えた、白いカードの作り（角丸・薄い影）。 */
const CARD_CLASS =
  'border-line rounded-[18px] border bg-white shadow-[0_2px_10px_rgba(23,23,23,0.06)]';

/** 金枠（次の試合・全試合終了）。 */
const GOLD_FRAME_CLASS =
  'border-gold from-gold-pale to-gold-soft rounded-[20px] border-2 bg-linear-to-b shadow-[0_2px_10px_rgba(156,101,18,0.1)]';

function recordText(record: MyRecord): string {
  return `${record.wins}勝${record.losses}敗`;
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

/** 部の丸い札。色は並び順で決まる（class-labels.ts）。 */
function ClassPill({ label, size }: { label: ClassLabel; size: 'large' | 'medium' | 'small' }) {
  const colors = classColorClasses(label.colorNumber);
  const sizeClass = {
    large: 'px-2.5 py-[3px] text-[14px]',
    medium: 'px-2 py-px text-[13px]',
    small: 'px-[7px] py-px text-[12px]',
  }[size];
  return (
    <span
      className={`shrink-0 rounded-full font-extrabold ${sizeClass} ${colors.text} ${colors.tint}`}
    >
      {label.name}
    </span>
  );
}

function opponentText(match: MyMatch): string {
  return match.opponentNames.join('・');
}

function subtitleText(remainingCount: number, hasAnyMatch: boolean): string {
  if (remainingCount > 0) return `myページ · あと${remainingCount}試合`;
  if (hasAnyMatch) return 'myページ · 全試合終了';
  return 'myページ';
}

/**
 * 選手のマイページ。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 上から 見出し →「次の試合」（金枠）→「そのあとの試合」→「終わった試合」→ 戻るボタン。
 * 仕様: docs/specs/2026-11-22-me-redesign.md
 */
export function MyPage({ profile, record, remainingCount, matches }: Props) {
  const waiting = matches.filter((match) => match.status === 'waiting');
  const finished = matches.filter((match) => match.status === 'done');
  const [next, ...later] = waiting;
  // 試合中だけが残っている（未実施が無い）ときは、金枠を出さない
  const allFinished = remainingCount === 0 && finished.length > 0;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-5 pb-7">
      <NavbarSubtitle>
        {subtitleText(remainingCount, matches.length > 0 || remainingCount > 0)}
      </NavbarSubtitle>

      <Heading profile={profile} />

      {next && <NextMatchCard match={next} />}
      {allFinished && <AllFinishedFrame record={record} />}
      {matches.length === 0 && remainingCount === 0 && (
        <p className={`${CARD_CLASS} p-4 text-[15px] font-bold text-gray-500`}>
          まだ試合が登録されていません
        </p>
      )}

      {later.length > 0 && (
        <section data-testid="later-matches" className="flex flex-col gap-2.5">
          <h2 className="text-ink-3 px-0.5 pt-1 text-[15px] font-extrabold">そのあとの試合</h2>
          <ul className="flex flex-col gap-2.5">
            {later.map((match) => (
              <LaterMatchCard key={match.id} match={match} />
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div
            data-testid="finished-heading"
            className="flex items-center justify-between gap-2 px-0.5 pt-1"
          >
            <h2 className="text-[16px] font-extrabold">終わった試合</h2>
            <span className="tabular text-[20px] font-black">{recordText(record)}</span>
          </div>
          <ul
            data-testid="finished-card"
            className={`${CARD_CLASS} divide-line divide-y overflow-hidden`}
          >
            {finished.map((match) => (
              <FinishedRow key={match.id} match={match} />
            ))}
          </ul>
        </section>
      )}

      {/* 押した時点で退場し、チームを選ぶ最初の画面へ移る。確認は挟まない（位置が一番下なので誤タップしにくい） */}
      <div className="border-line mt-2 border-t pt-5">
        <ReenterButton label="‹ 名前を選ぶ画面に戻る" />
      </div>
    </div>
  );
}

function Heading({ profile }: { profile: MyProfile }) {
  // チーム無しの参加者（入力係など）は薄い色（色の決めごとは class-labels.ts の 1 か所）
  const avatarClass = teamBgClass(profile.teamNumber);
  // 薄い色の上に白い頭文字は読めないので、チーム色が無いときだけ文字を濃くする
  const avatarTextClass = hasTeamColor(profile.teamNumber) ? 'text-white' : 'text-ink';

  return (
    <div data-testid="my-heading" className="flex items-center gap-3.5">
      <div
        aria-hidden="true"
        className={`flex size-14 shrink-0 items-center justify-center rounded-full text-[24px] font-extrabold ${avatarTextClass} ${avatarClass}`}
      >
        {profile.name.charAt(0)}
      </div>
      {/* 長い名前でも横にはみ出さず折り返すよう min-w-0 を付ける */}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[22px] leading-tight font-extrabold [overflow-wrap:anywhere]">
          {profile.name}
        </p>
        <div className="text-ink-3 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          <span className="[overflow-wrap:anywhere]">{profile.teamName ?? 'チームなし'}</span>
          {profile.classLabel && <ClassPill label={profile.classLabel} size="large" />}
        </div>
      </div>
    </div>
  );
}

function NextMatchCard({ match }: { match: MyMatch }) {
  const courtDecided = Boolean(match.courtNumber);
  return (
    <section
      data-testid="next-match"
      className={`${GOLD_FRAME_CLASS} flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-gold-ink text-[15px] font-extrabold">次の試合</h2>
        <ClassPill label={match.classLabel} size="large" />
      </div>

      <div className="tabular flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-[44px] leading-[1.1] font-black tracking-[-0.01em]">
          {courtDecided ? `コート${match.courtNumber}` : 'コート未定'}
        </span>
        <span className="text-[22px] font-extrabold">
          {match.orderInCourt ? `${match.orderInCourt}試合目` : '順番未定'}
        </span>
      </div>
      {!courtDecided && (
        <p className="text-gold-ink -mt-1.5 text-[13px] font-bold">
          コートが決まるとここに大きく出ます
        </p>
      )}

      <dl className="border-gold grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-t border-dashed pt-2.5 text-[16px]">
        <dt className="text-gold-ink text-[14px] font-bold">回戦</dt>
        <dd className="font-semibold [overflow-wrap:anywhere]">{match.roundLabel}</dd>
        {match.partnerName && (
          <>
            <dt className="text-gold-ink text-[14px] font-bold">ペア</dt>
            <dd className="font-bold [overflow-wrap:anywhere]">
              <Words text={match.partnerName} />
            </dd>
          </>
        )}
        <dt className="text-gold-ink text-[14px] font-bold">相手</dt>
        <dd className="font-bold [overflow-wrap:anywhere]">
          <Words text={opponentText(match)} />
          {match.opponentTeamName && (
            <span className="text-ink-3 ml-1.5 text-[14px] font-medium">
              {match.opponentTeamName}
            </span>
          )}
        </dd>
      </dl>
    </section>
  );
}

function AllFinishedFrame({ record }: { record: MyRecord }) {
  return (
    <section
      data-testid="all-finished"
      className={`${GOLD_FRAME_CLASS} flex flex-col gap-1 p-[18px]`}
    >
      <h2 className="text-gold-ink text-[15px] font-extrabold">全試合が終わりました</h2>
      <p className="tabular text-[44px] leading-[1.15] font-black">{recordText(record)}</p>
    </section>
  );
}

function LaterMatchCard({ match }: { match: MyMatch }) {
  return (
    <li
      data-testid={`match-${match.id}`}
      className={`${CARD_CLASS} grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 p-3.5`}
    >
      <span
        aria-hidden="true"
        className="text-ink-3 border-btn-line-round grid size-11 place-items-center rounded-full border-2 border-dashed bg-white text-[13px] font-black"
      >
        予定
      </span>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-ink-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] font-semibold">
          <span className="[overflow-wrap:anywhere]">{match.roundLabel}</span>
          <ClassPill label={match.classLabel} size="medium" />
        </div>
        <p className="text-[17px] leading-[1.35] font-extrabold [overflow-wrap:anywhere]">
          {'vs '}
          <Words text={opponentText(match)} />
        </p>
        <p className="text-ink-3 text-[14px] [overflow-wrap:anywhere]">
          {match.opponentTeamName && <span>{match.opponentTeamName}</span>}
          {match.opponentTeamName && match.partnerName && '　'}
          {match.partnerName && <Words text={`${match.partnerName} とペア`} />}
        </p>
      </div>

      <div className="tabular flex min-w-14 flex-col items-end gap-px">
        <span className="text-[17px] font-black whitespace-nowrap">
          {match.courtNumber ? `コート${match.courtNumber}` : 'コート未定'}
        </span>
        <span className="text-ink-3 text-[14px] font-semibold whitespace-nowrap">
          {match.orderInCourt ? `${match.orderInCourt}試合目` : '順番未定'}
        </span>
      </div>
    </li>
  );
}

function FinishedRow({ match }: { match: MyMatch }) {
  // 勝ちは金の塗り、負けは白抜きの枠。色だけに頼らず「勝」「負」の字も出す
  const badgeClass = match.won
    ? 'bg-gold-ink text-white'
    : 'border-ink-3 text-ink-3 border-2 bg-white';

  return (
    <li
      data-testid={`match-${match.id}`}
      className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-3"
    >
      <span
        className={`grid size-9 place-items-center rounded-full text-[16px] font-black ${badgeClass}`}
      >
        {match.won ? '勝' : '負'}
      </span>

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-ink-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-semibold">
          <span className="[overflow-wrap:anywhere]">{match.roundLabel}</span>
          <ClassPill label={match.classLabel} size="small" />
        </div>
        <p className="text-[16px] leading-[1.35] font-bold [overflow-wrap:anywhere]">
          {'vs '}
          <Words text={opponentText(match)} />
          {match.opponentTeamName && (
            <span className="text-ink-3 ml-1 text-[13px] font-medium">
              {match.opponentTeamName}
            </span>
          )}
        </p>
        <p className="tabular text-ink-3 text-[14px] font-semibold">
          {match.gameScores?.map(([mine, theirs]) => `${mine}-${theirs}`).join(' / ')}
        </p>
        {/* 棄権した側は点数で勝っていても負けになるので、理由を濃い金で添える */}
        {match.retiredNames && (
          <RetiredNote names={match.retiredNames} className="text-gold-ink text-[13px]" />
        )}
      </div>

      <div className="tabular flex min-w-11 flex-col items-end">
        {match.gamesWon !== undefined && match.gamesLost !== undefined && (
          <span data-testid="game-count" className="text-[20px] font-black whitespace-nowrap">
            {match.gamesWon}-{match.gamesLost}
          </span>
        )}
      </div>
    </li>
  );
}
