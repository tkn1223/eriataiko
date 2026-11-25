'use client';

import { teamBgClass, teamPanelClasses } from '@/domain/class-labels';
import type { Champion, CardStatus, KoBracketData, KoMatch, KoSlot } from '@/ui/bracket/types';

type Props = {
  data: KoBracketData;
  /** 自分のチームの番号。決勝に自分のチームがいれば「自分のチーム」を添える。 */
  selfTeamNumber?: number;
};

/**
 * 決勝トーナメント（準決勝 → 決勝 → 優勝、と 3位決定戦）。
 *
 * 375px の画面に横に動かさず収まるよう、上から縦に並べる
 * （準決勝 2 つだけ横に並べ、決勝へ線でつなぐ）。
 * 枠は、チームが入っていればチーム名（チーム色つき）、まだ空なら表に入っている空枠の名前
 * （「予選1位」など）を薄字で出す。予選の結果から自動で埋めることはしない。
 * 対戦の数字は中の試合の勝ち数（終わった試合だけ）。
 */
export function KoBracket({ data, selfTeamNumber }: Props) {
  return (
    <div className="mb-3">
      {data.champion.decided && <ChampionBanner champion={data.champion} />}

      <section className="court-card rounded-[18px] p-3">
        {!data.leagueFinished && (
          <p className="text-muted-ink mb-2 text-[12px] font-bold">
            組み合わせは予選リーグ終了後に確定します
          </p>
        )}

        <Stage title="準決勝" />
        <div className="grid grid-cols-2 gap-2.5">
          <KoBox match={data.semifinals[0]} title="準決勝①" />
          <KoBox match={data.semifinals[1]} title="準決勝②" />
        </div>

        {/* 準決勝の 2 つの真ん中から、下の決勝へ */}
        <div
          aria-hidden="true"
          className="border-gold-connect relative mx-[70px] h-[21px] rounded-b-[7px] border-x-[1.5px] border-b-[1.5px]"
        >
          <div className="border-gold-connect absolute top-[20px] left-1/2 h-3 border-l-[1.5px]" />
        </div>

        <Stage title="決勝" />
        <FinalBox match={data.final} selfTeamNumber={selfTeamNumber} />

        <ChampionBox champion={data.champion} />

        {/* 区切りの見出しは付けず、箱の左上に名前を出す（同じ字が 2 回並ばないように） */}
        <div className="mt-3">
          <KoBox match={data.thirdPlace} title="3位決定戦" />
        </div>
      </section>
    </div>
  );
}

function Stage({ title }: { title: string }) {
  return (
    <h3 className="after:bg-line my-3 flex items-center gap-2 text-[13px] font-extrabold after:h-px after:flex-1">
      {title}
    </h3>
  );
}

function ChampionBanner({ champion }: { champion: Champion }) {
  return (
    <div className="bg-ink mb-3 rounded-[14px] px-4 py-3 text-center text-[18px] font-black text-white">
      🏆 優勝：{champion.teamName}
    </div>
  );
}

function ChampionBox({ champion }: { champion: Champion }) {
  return (
    <div
      data-testid="ko-champion-box"
      className="border-champion-line bg-champion-bg text-champion-ink my-2.5 rounded-[11px] border border-dashed p-2.5 text-center text-[12px]"
    >
      <span>優勝</span>
      <strong
        className={`ml-2 ${champion.decided ? 'text-ink text-[14px] font-black' : 'font-bold'}`}
      >
        {champion.decided ? champion.teamName : 'まだ決まっていません'}
      </strong>
    </div>
  );
}

/** 終わった一戦の勝者。まだ終わっていない・引き分け・数字が無いときは null。 */
function winnerOf(match: KoMatch): 'a' | 'b' | null {
  if (match.status !== 'done' || match.scoreA === undefined || match.scoreB === undefined) {
    return null;
  }
  if (match.scoreA > match.scoreB) return 'a';
  if (match.scoreB > match.scoreA) return 'b';
  return null;
}

const STATUS_TEXT: Record<CardStatus, string> = { done: '終了', live: '試合中', waiting: 'まだ' };

/** 状態の札。試合中だけ緑の札、ほかは小さい文字。 */
function StatusLabel({ status }: { status: CardStatus }) {
  if (status === 'live') return <LiveTag />;
  return <span className="text-ink-3 font-bold">{STATUS_TEXT[status]}</span>;
}

function LiveTag() {
  return (
    <span className="bg-status-live text-status-live-ink rounded-full px-2 py-0.5 text-[11px] font-extrabold">
      試合中
    </span>
  );
}

/** 準決勝・3位決定戦の箱。上に小さな名前と状態、下に 2 行。 */
function KoBox({ match, title }: { match: KoMatch; title?: string }) {
  const winner = winnerOf(match);

  return (
    <div
      data-testid={`ko-match-${match.id}`}
      data-status={match.status}
      className={`overflow-hidden rounded-xl border bg-white ${
        match.status === 'live' ? 'border-status-live-dot' : 'border-line'
      }`}
    >
      <div className="bg-fill-row text-ink-3 flex min-h-[30px] items-center justify-between px-2 py-1 text-[11px]">
        <span>{title}</span>
        <StatusLabel status={match.status} />
      </div>
      <SlotRow
        slot={match.slotA}
        score={match.scoreA}
        scoreTestId="ko-score-a"
        winner={winner === 'a'}
        loser={winner === 'b'}
      />
      <div aria-hidden="true" className="border-line border-t" />
      <SlotRow
        slot={match.slotB}
        score={match.scoreB}
        scoreTestId="ko-score-b"
        winner={winner === 'b'}
        loser={winner === 'a'}
      />
    </div>
  );
}

function SlotRow({
  slot,
  score,
  scoreTestId,
  winner,
  loser,
}: {
  slot: KoSlot;
  score: number | undefined;
  scoreTestId: string;
  winner: boolean;
  loser: boolean;
}) {
  const nameClass = !slot.isDecided
    ? 'text-[12px] font-bold text-gray-400'
    : winner
      ? 'text-[13px] font-black'
      : loser
        ? 'text-[13px] font-bold text-gray-500'
        : 'text-[13px] font-bold';

  return (
    <div
      className={`flex min-h-[34px] items-center gap-[3px] px-2 py-1.5 ${winner ? 'bg-gold-soft' : ''}`}
    >
      {slot.isDecided && (
        <span
          aria-hidden="true"
          data-testid="ko-team-dot"
          className={`size-[7px] shrink-0 rounded-[2px] ${teamBgClass(slot.teamNumber ?? null)}`}
        />
      )}
      <span className={`min-w-0 flex-1 break-words ${nameClass}`}>{slot.label}</span>
      {score !== undefined && (
        <span
          data-testid={scoreTestId}
          className={`tabular shrink-0 text-[16px] font-black ${loser ? 'text-gray-500' : ''}`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

/** 決勝の大きな箱。左右にチーム名、真ん中に大きく勝ち試合数（まだなら「vs」）。 */
function FinalBox({ match, selfTeamNumber }: { match: KoMatch; selfTeamNumber?: number }) {
  const winner = winnerOf(match);
  const hasScore = match.scoreA !== undefined && match.scoreB !== undefined;

  return (
    <div
      data-testid={`ko-match-${match.id}`}
      data-status={match.status}
      className="ko-final-box rounded-[14px] p-3"
    >
      {match.status === 'live' && (
        <div className="mb-2.5 flex justify-end">
          <LiveTag />
        </div>
      )}
      <div className="grid grid-cols-[1fr_72px_1fr] items-center text-center">
        <FinalSide
          slot={match.slotA}
          winner={winner === 'a'}
          loser={winner === 'b'}
          selfTeamNumber={selfTeamNumber}
        />
        <div className="tabular text-[28px] leading-none font-extrabold tracking-[-1px]">
          {hasScore ? (
            <>
              <span data-testid="ko-score-a">{match.scoreA}</span>
              <span>-</span>
              <span data-testid="ko-score-b">{match.scoreB}</span>
            </>
          ) : (
            <span className="text-muted-ink text-[18px] tracking-normal">vs</span>
          )}
        </div>
        <FinalSide
          slot={match.slotB}
          winner={winner === 'b'}
          loser={winner === 'a'}
          selfTeamNumber={selfTeamNumber}
        />
      </div>
    </div>
  );
}

function FinalSide({
  slot,
  winner,
  loser,
  selfTeamNumber,
}: {
  slot: KoSlot;
  winner: boolean;
  loser: boolean;
  selfTeamNumber?: number;
}) {
  const panel = teamPanelClasses(slot.isDecided ? (slot.teamNumber ?? null) : null);
  const isSelf =
    slot.isDecided && slot.teamNumber !== undefined && slot.teamNumber === selfTeamNumber;
  // 負けた側はチーム色の文字をやめて薄い字にする（準決勝の箱と同じ見え方。上の色の線は残す）
  const nameColor = !slot.isDecided ? 'text-gray-400' : loser ? 'text-gray-500' : panel.text;

  return (
    <div className={`min-w-0 border-t-[3px] pt-2 ${panel.border}`}>
      <span
        className={`block text-[13px] break-words ${winner ? 'font-black' : 'font-bold'} ${nameColor}`}
      >
        {slot.label}
      </span>
      {isSelf && (
        <small className="text-gold-ink mt-1 block text-[11px] font-semibold">自分のチーム</small>
      )}
    </div>
  );
}
