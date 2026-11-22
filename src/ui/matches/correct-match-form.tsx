'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { retiredSideOf } from '@/domain/match-rules';
import { playedGameScores } from '@/domain/scoring';
import { sendRequest } from '@/ui/courts/send-request';
import { TeamPanel } from '@/ui/courts/team-panel';
import {
  changedGamesOf,
  checkDraft,
  describeChanges,
  draftOf,
  setScore,
  toRequestBody,
  type CorrectionDraft,
} from '@/ui/matches/correction-draft';
import { pairNameOf } from '@/ui/matches/match-parts';
import { NavbarSubtitle } from '@/ui/navbar-subtitle';
import type { BoardMatch } from '@/ui/matches/types';

/** 試合速報の［−］［＋］と同じ大きさ（高さ 46px）。 */
const SCORE_BUTTON =
  'flex h-[46px] min-w-0 flex-1 items-center justify-center rounded-xl text-[28px] leading-none font-semibold';

const NETWORK_MESSAGE =
  'つながりませんでした。電波のよいところで、もう一度押してください（同じ内容を送り直しても大丈夫です）。';

/**
 * 点の数字。押すと数字で直接入れられる（確定は欄を離れたときか Enter）。
 * 押し間違えやすい［＋］の連打より、「21 にしたい」を一度で入れられるように。
 */
function ScoreEntry({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const committed = useRef(false);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    const parsed = Number.parseInt((text ?? '').replace(/[^0-9]/g, ''), 10);
    onCommit(Number.isNaN(parsed) ? 0 : parsed);
    setText(null);
  }

  if (text === null) {
    return (
      <button
        type="button"
        aria-label={`${label}の点を入力する`}
        onClick={() => {
          committed.current = false;
          setText(String(value));
        }}
        className="score-number mt-1 mb-0.5 block min-h-11 w-full"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={`${label}の点`}
      autoFocus
      value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="score-number mt-1 mb-0.5 w-full rounded-lg border-2 border-[#171717] bg-white text-center"
    />
  );
}

function OriginalBadge({ value }: { value: number }) {
  return (
    <span className="bg-gold-soft text-gold-ink mx-auto mb-1 inline-block rounded-full px-2 py-0.5 text-[12px] font-bold">
      元は {value}
    </span>
  );
}

/**
 * 2b 直す画面（得点板の形）。ゲームのタブ・得点板・［−］［＋］・棄権の 3 択は、
 * **手元の値だけを変える**（試合速報と違って 1 点ずつ送らない）。
 * ［この内容で訂正する］で全部まとめて送り、確認画面は挟まない（この画面自体が確認）。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export function CorrectMatchForm({ match }: { match: BoardMatch }) {
  const router = useRouter();
  const [draft, setDraft] = useState<CorrectionDraft>(() => draftOf(match));
  const lastPlayed = playedGameScores(draft.scores).at(-1)?.gameNumber ?? 1;
  const [shownGame, setShownGame] = useState(lastPlayed);
  // 「＋第3ゲーム」で足したゲーム（点が 0 対 0 のままでもタブとして残す）
  const [revealedUpTo, setRevealedUpTo] = useState(lastPlayed);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const changedGames = changedGamesOf(match, draft);
  const changedNumbers = new Set(changedGames.map((game) => game.gameNumber));
  const changes = describeChanges(match, draft);
  const check = checkDraft(match, draft);
  // 「変えていません」は理由として出さない（まだ何もしていないだけ）。同点などの断る理由だけ警告にする
  const warning = !check.ok && changes.length > 0 ? check.reason : null;

  const visibleCount = Math.max(
    revealedUpTo,
    playedGameScores(draft.scores).at(-1)?.gameNumber ?? 1
  );
  const visibleGames = draft.scores.filter((score) => score.gameNumber <= visibleCount);
  const shown = draft.scores.find((score) => score.gameNumber === shownGame) ?? draft.scores[0];
  const originalOf = (side: 'A' | 'B') => {
    const before = changedGames.find((game) => game.gameNumber === shown.gameNumber)?.before;
    return before ? before[side === 'A' ? 0 : 1] : null;
  };

  const nameA = pairNameOf(match.teamA);
  const nameB = pairNameOf(match.teamB);
  const courtText = [
    match.courtNumber === null ? 'コート未定' : `コート${match.courtNumber}`,
    match.orderInCourt === null ? null : `${match.orderInCourt}試合目`,
  ]
    .filter(Boolean)
    .join(' ・ ');
  const originalRetired = retiredSideOf(match.ending);

  function change(side: 'A' | 'B', value: (current: number) => number) {
    const current = shown[side === 'A' ? 'sideAScore' : 'sideBScore'];
    setDraft((previous) => setScore(previous, shown.gameNumber, side, value(current)));
  }

  async function save() {
    if (!check.ok || sending) return;
    setSending(true);
    setSendError(null);
    const result = await sendRequest({
      url: `/api/matches/${match.matchId}/correction`,
      method: 'PUT',
      body: toRequestBody(draft),
    });
    if (result.ok) {
      router.push(`/matches/${match.matchId}?corrected=${changedGames[0]?.gameNumber ?? 0}`);
      return;
    }
    setSending(false);
    setSendError(
      result.kind === 'network'
        ? NETWORK_MESSAGE
        : (result.message ?? '訂正できませんでした。画面を開き直してください。')
    );
  }

  const retiredChoices: { value: 'A' | 'B' | null; label: string }[] = [
    { value: null, label: '棄権なし' },
    { value: 'A', label: `${nameA} が棄権` },
    { value: 'B', label: `${nameB} が棄権` },
  ];

  return (
    <div className="mx-auto max-w-md">
      <NavbarSubtitle>得点の訂正</NavbarSubtitle>

      <div className="flex items-center px-3 pt-2">
        <Link
          href={`/matches/${match.matchId}`}
          className="flex min-h-11 items-center gap-1 px-1.5 text-[14.5px] font-bold"
        >
          <span aria-hidden="true" className="text-[22px] leading-none">
            ‹
          </span>
          やめる
        </Link>
        <span className="ml-auto pr-1.5 text-[13px] text-[#666]">{courtText}</span>
      </div>

      <div className="flex flex-col gap-2.5 px-3 pt-1 pb-3.5">
        <div className="court-card flex flex-col gap-2.5 rounded-[18px] p-3">
          <div
            role="tablist"
            aria-label="ゲームの切り替え"
            className="bg-fill-tabs flex gap-[3px] rounded-xl p-[3px]"
          >
            {visibleGames.map((score) => {
              const selected = score.gameNumber === shown.gameNumber;
              const changed = changedNumbers.has(score.gameNumber);
              return (
                <button
                  key={score.gameNumber}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setShownGame(score.gameNumber)}
                  className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-[10px] ${
                    selected ? 'tab-on' : 'text-ink-2'
                  }`}
                >
                  <span className="text-[13px] font-bold">{`第${score.gameNumber}ゲーム`}</span>
                  <span
                    className={`tabular text-[11.5px] font-semibold ${
                      changed ? 'font-bold' : 'text-[#777]'
                    } ${changed && selected ? 'text-gold-light' : changed ? 'text-gold-ink' : ''}`}
                  >
                    {`${score.sideAScore}-${score.sideBScore}${changed ? ' 変更' : ''}`}
                  </span>
                </button>
              );
            })}
            {visibleCount < match.maxGameCount && (
              <button
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => {
                  setRevealedUpTo(visibleCount + 1);
                  setShownGame(visibleCount + 1);
                }}
                className="text-ink-3 flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-[10px] text-[13px] font-bold"
              >
                {`＋第${visibleCount + 1}ゲーム`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {(['A', 'B'] as const).map((side) => {
              const team = side === 'A' ? match.teamA : match.teamB;
              const name = side === 'A' ? nameA : nameB;
              const value = side === 'A' ? shown.sideAScore : shown.sideBScore;
              const original = originalOf(side);
              const label = `${name}の第${shown.gameNumber}ゲーム`;
              return (
                <div key={side} className="flex flex-col gap-2">
                  <TeamPanel
                    testId={`team-panel-${side}`}
                    team={team}
                    score={value}
                    scoreSlot={
                      <ScoreEntry
                        key={`${shown.gameNumber}-${side}`}
                        label={label}
                        value={value}
                        onCommit={(next) => change(side, () => next)}
                      />
                    }
                    footer={
                      original !== null && original !== value && <OriginalBadge value={original} />
                    }
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      aria-label={`${label}の得点を1減らす`}
                      onClick={() => change(side, (current) => current - 1)}
                      className={`${SCORE_BUTTON} btn-minus`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={`${label}の得点を1増やす`}
                      onClick={() => change(side, (current) => current + 1)}
                      className={`${SCORE_BUTTON} btn-plus`}
                    >
                      ＋
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-line flex flex-col gap-1.5 rounded-[18px] border bg-white p-3">
          <div className="flex items-center gap-2">
            <h2 id="retired-heading" className="text-[14px] font-extrabold">
              棄権
            </h2>
            {draft.retiredSide !== originalRetired && (
              <span className="text-gold-ink text-[12px] font-bold">変更あり</span>
            )}
          </div>
          <div
            role="radiogroup"
            aria-labelledby="retired-heading"
            className="flex flex-col gap-1.5"
          >
            {retiredChoices.map((choice) => {
              const checked = draft.retiredSide === choice.value;
              return (
                <button
                  key={choice.label}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() =>
                    setDraft((previous) => ({ ...previous, retiredSide: choice.value }))
                  }
                  className={`flex min-h-[46px] items-center gap-2.5 rounded-xl px-3 text-left text-[14.5px] ${
                    checked
                      ? 'border-ink border-[1.5px] font-bold'
                      : 'border-btn-line border font-semibold'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-5 shrink-0 rounded-full ${
                      checked ? 'border-ink border-[6px]' : 'border-[1.5px] border-[#b5b0a8]'
                    }`}
                  />
                  {choice.label}
                  {choice.value === originalRetired && originalRetired !== null && (
                    <span className="ml-auto text-[11.5px] font-normal text-[#888]">
                      いまの記録
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 下のメニューの上に貼り付ける（スクロールしても［訂正する］が見える） */}
      <div className="border-line sticky bottom-[calc(80px+env(safe-area-inset-bottom))] flex flex-col gap-2.5 border-t bg-white px-3 pt-3 pb-3.5">
        <div className="flex flex-col gap-0.5">
          <p data-testid="change-summary" className="text-[13px] leading-[1.6] text-[#444]">
            {changes.length === 0 ? (
              'まだ変えていません'
            ) : (
              <>
                <b className="text-gold-ink">変えるところ</b>
                {'　'}
                {changes.join(' ・ ')}
              </>
            )}
          </p>
          <p className="text-[12px] text-[#777]">保存すると星取表・順位もいっしょに変わります</p>
        </div>
        {(warning ?? sendError) && (
          <p role="alert" className="text-live text-[13px] font-bold break-words">
            {warning ?? sendError}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!check.ok || sending}
          className="btn-end min-h-12 rounded-xl text-[15px] font-bold disabled:opacity-40"
        >
          {sending ? '送っています' : 'この内容で訂正する'}
        </button>
      </div>
    </div>
  );
}
