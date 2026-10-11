// 大会の CSV（大会.csv / 選手.csv / 試合.csv）を読んで、検査して、書き込む行に組み立てる。
//
// **DB も画面も触らない純粋な処理。** 書き込みは import-competition-db.mjs。
// 仕様: docs/specs/2026-10-11-csv-import.md
//
// 方針:
//   - 問題は 1 件目で止めず、全部集めて「ファイル名 + 行番号」つきの日本語で返す
//     （直してはやり直し、を何度も繰り返させないため）
//   - 問題が 1 つでもあれば plan は null。呼び出し側は何も書き込まない

export const FILE_COMPETITION = '大会.csv';
export const FILE_PLAYERS = '選手.csv';
export const FILE_MATCHES = '試合.csv';

/** 決勝トーナメントの対戦の数。src/usecases/build-bracket-view.ts の KNOCKOUT_MATCHUP_COUNT と同じ決まり */
const KNOCKOUT_MATCHUP_COUNT = 4;
/** 色が 4 色までしか用意されていないので、チーム番号は 1〜4（teams_team_number_range と同じ） */
const MAX_TEAM_NUMBER = 4;

const FORMAT_BY_LABEL = /** @type {const} */ ({ リーグ: 'league', トーナメント: 'knockout' });

/**
 * @typedef {{ line: number, cells: string[] }} CsvRow
 * @typedef {{ rows: CsvRow[], unclosedQuoteLine: number | null }} ParsedCsv
 */

/**
 * CSV を読む。引用符・引用符の中の改行・"" のエスケープ・先頭の BOM・CRLF に対応。
 * Google スプレッドシートや Excel が出す CSV はこれで足りる。
 * line は物理的な行番号（1 始まり）。引用符の中の改行も数えるので、エディタの行番号と合う。
 * @param {string} text
 * @returns {ParsedCsv}
 */
export function parseCsv(text) {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  /** @type {CsvRow[]} */
  const rows = [];
  /** @type {string[]} */
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let quoteOpenedLine = 0;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell.trim());
    cell = '';
  };
  const endRecord = () => {
    endCell();
    // 空行（全部の欄が空）は読み飛ばす。末尾の改行で空の行ができるため
    if (cells.some((value) => value !== '')) rows.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      inQuotes = true;
      quoteOpenedLine = line;
    } else if (char === ',') {
      endCell();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  if (inQuotes) return { rows, unclosedQuoteLine: quoteOpenedLine };
  if (cell !== '' || cells.length > 0) endRecord();
  return { rows, unclosedQuoteLine: null };
}

/** @param {string} value */
function toPositiveInt(value) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** @param {string} value */
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * @typedef {{
 *   competition: { name: string, heldOn: string },
 *   hall: { name: string, courtCount: number },
 *   courtCount: number,
 *   teams: { teamNumber: number, name: string, sortOrder: number }[],
 *   divisions: { name: string, sortOrder: number }[],
 *   stages: { name: string, format: 'league' | 'knockout', sortOrder: number }[],
 *   matchSettings: { stage: string, division: string, maxGameCount: number }[],
 *   players: { playerNumber: number, name: string, team: string | null, division: string | null }[],
 *   matchups: PlanMatchup[],
 *   emptySlots: { stage: string, roundName: string, side: 'a' | 'b', label: string }[],
 * }} CompetitionPlan
 *
 * @typedef {{
 *   stage: string,
 *   roundName: string,
 *   sortOrder: number,
 *   sideATeam: string | null,
 *   sideBTeam: string | null,
 *   sideASlotLabel: string | null,
 *   sideBSlotLabel: string | null,
 *   matches: PlanMatch[],
 * }} PlanMatchup
 *
 * @typedef {{
 *   division: string,
 *   orderInMatchup: number,
 *   courtNumber: number,
 *   orderInCourt: number,
 *   maxGameCount: number,
 *   sideA: number[],
 *   sideB: number[],
 * }} PlanMatch
 */

/**
 * 3 枚の CSV の中身（文字列）を検査して、書き込む行に組み立てる。
 * @param {{ competitionCsv: string, playersCsv: string, matchesCsv: string }} sheets
 * @returns {{ problems: string[], plan: CompetitionPlan | null }}
 */
export function buildCompetitionPlan({ competitionCsv, playersCsv, matchesCsv }) {
  /** @type {string[]} */
  const problems = [];
  /** @param {string} file @param {number | null} line @param {string} message */
  const report = (file, line, message) =>
    problems.push(line ? `${file} ${line}行目: ${message}` : `${file}: ${message}`);

  /**
   * 見出しの行を読んで、必須の列が揃っているか確かめる。列の順番は問わない。
   * @param {string} file @param {string} text @param {string[]} required
   * @returns {{ line: number, get: (name: string) => string }[]}
   */
  const readTable = (file, text, required) => {
    const parsed = parseCsv(text);
    if (parsed.unclosedQuoteLine) {
      report(file, parsed.unclosedQuoteLine, '引用符（"）が閉じていません');
      return [];
    }
    const [header, ...body] = parsed.rows;
    if (!header) {
      report(file, null, '中身が空です');
      return [];
    }
    const missing = required.filter((name) => !header.cells.includes(name));
    if (missing.length > 0) {
      report(file, header.line, `必須の列「${missing.join('」「')}」がありません`);
      return [];
    }
    return body.map((row) => ({
      line: row.line,
      get: (name) => row.cells[header.cells.indexOf(name)] ?? '',
    }));
  };

  // ---------------- 大会.csv ----------------
  const competitionRows = readTable(FILE_COMPETITION, competitionCsv, ['種類', '名前', '値']);

  /** @type {{ line: number, name: string, heldOn: string }[]} */
  const competitions = [];
  /** @type {{ line: number, name: string, courtCount: number }[]} */
  const halls = [];
  /** @type {{ line: number, courtCount: number }[]} */
  const courtCounts = [];
  /** @type {Map<string, { line: number, teamNumber: number }>} */
  const teamByName = new Map();
  /** @type {Map<number, number>} チーム番号 → 最初に書いた行 */
  const teamNumberLine = new Map();
  /** @type {Map<string, { line: number }>} */
  const divisionByName = new Map();
  /** @type {Map<string, { line: number, format: 'league' | 'knockout' }>} */
  const stageByName = new Map();
  /** @type {{ line: number, stage: string, division: string, maxGameCount: number }[]} */
  const gameCountRows = [];
  /** @type {CompetitionPlan['teams']} */
  const teams = [];
  /** @type {CompetitionPlan['divisions']} */
  const divisions = [];
  /** @type {CompetitionPlan['stages']} */
  const stages = [];

  for (const row of competitionRows) {
    const kind = row.get('種類');
    const name = row.get('名前');
    const value = row.get('値');
    const requireName = () => {
      if (name === '') report(FILE_COMPETITION, row.line, `「${kind}」の名前が空です`);
      return name !== '';
    };

    if (kind === '大会') {
      if (!requireName()) continue;
      if (!isRealDate(value)) {
        report(
          FILE_COMPETITION,
          row.line,
          `日付は YYYY-MM-DD の形（例: 2026-11-23）で、実際にある日にしてください（「${value}」）`
        );
        continue;
      }
      competitions.push({ line: row.line, name, heldOn: value });
    } else if (kind === '会場') {
      if (!requireName()) continue;
      const count = toPositiveInt(value);
      if (count === null) {
        report(
          FILE_COMPETITION,
          row.line,
          `会場の面数（値）は 1 以上の整数にしてください（「${value}」）`
        );
        continue;
      }
      halls.push({ line: row.line, name, courtCount: count });
    } else if (kind === '面数') {
      const count = toPositiveInt(value);
      if (count === null) {
        report(
          FILE_COMPETITION,
          row.line,
          `面数（値）は 1 以上の整数にしてください（「${value}」）`
        );
        continue;
      }
      courtCounts.push({ line: row.line, courtCount: count });
    } else if (kind === 'チーム') {
      if (!requireName()) continue;
      const teamNumber = toPositiveInt(value);
      let ok = true;
      if (teamNumber === null || teamNumber > MAX_TEAM_NUMBER) {
        report(
          FILE_COMPETITION,
          row.line,
          `チーム番号（値）は 1〜${MAX_TEAM_NUMBER} の整数にしてください（「${value}」）`
        );
        ok = false;
      } else if (teamNumberLine.has(teamNumber)) {
        report(
          FILE_COMPETITION,
          row.line,
          `チーム番号 ${teamNumber} が ${teamNumberLine.get(teamNumber)}行目と重なっています`
        );
        ok = false;
      }
      if (teamByName.has(name)) {
        report(
          FILE_COMPETITION,
          row.line,
          `チーム「${name}」が ${teamByName.get(name)?.line}行目と重なっています`
        );
        ok = false;
      }
      if (!ok || teamNumber === null) continue;
      teamNumberLine.set(teamNumber, row.line);
      teamByName.set(name, { line: row.line, teamNumber });
      teams.push({ teamNumber, name, sortOrder: (teams.length + 1) * 10 });
    } else if (kind === '部') {
      if (!requireName()) continue;
      if (divisionByName.has(name)) {
        report(
          FILE_COMPETITION,
          row.line,
          `部「${name}」が ${divisionByName.get(name)?.line}行目と重なっています`
        );
        continue;
      }
      divisionByName.set(name, { line: row.line });
      divisions.push({ name, sortOrder: (divisions.length + 1) * 10 });
    } else if (kind === '段') {
      if (!requireName()) continue;
      const format = FORMAT_BY_LABEL[/** @type {keyof typeof FORMAT_BY_LABEL} */ (value)];
      if (!format) {
        report(
          FILE_COMPETITION,
          row.line,
          `段の種類（値）は「リーグ」か「トーナメント」にしてください（「${value}」）`
        );
        continue;
      }
      if (stageByName.has(name)) {
        report(
          FILE_COMPETITION,
          row.line,
          `段「${name}」が ${stageByName.get(name)?.line}行目と重なっています`
        );
        continue;
      }
      stageByName.set(name, { line: row.line, format });
      stages.push({ name, format, sortOrder: (stages.length + 1) * 10 });
    } else if (kind === 'ゲーム数') {
      const parts = name.split('/').map((part) => part.trim());
      const count = toPositiveInt(value);
      if (parts.length !== 2 || parts.some((part) => part === '')) {
        report(
          FILE_COMPETITION,
          row.line,
          `ゲーム数の名前は「段/部」の形にしてください（「${name}」）`
        );
        continue;
      }
      if (count === null) {
        report(
          FILE_COMPETITION,
          row.line,
          `ゲーム数（値）は 1 以上の整数にしてください（「${value}」）`
        );
        continue;
      }
      gameCountRows.push({
        line: row.line,
        stage: parts[0],
        division: parts[1],
        maxGameCount: count,
      });
    } else {
      report(
        FILE_COMPETITION,
        row.line,
        `知らない種類「${kind}」です（大会・会場・面数・チーム・部・段・ゲーム数のどれか）`
      );
    }
  }

  /** @param {string} label @param {{ line: number }[]} found */
  const requireExactlyOne = (label, found) => {
    if (found.length === 0) report(FILE_COMPETITION, null, `「${label}」の行がありません`);
    else if (found.length > 1)
      report(FILE_COMPETITION, found[1].line, `「${label}」の行は 1 つだけにしてください`);
  };
  if (competitionRows.length > 0) {
    requireExactlyOne('大会', competitions);
    requireExactlyOne('会場', halls);
    requireExactlyOne('面数', courtCounts);
    // 今年押さえた面数が会場の面数を超えるのは書き間違い。超えたコートを許してしまうので止める
    if (courtCounts[0] && halls[0] && courtCounts[0].courtCount > halls[0].courtCount) {
      report(
        FILE_COMPETITION,
        courtCounts[0].line,
        `面数（${courtCounts[0].courtCount}）が会場「${halls[0].name}」の面数（${halls[0].courtCount}）より多くなっています。書き間違いでないか確かめてください`
      );
    }
    if (teams.length === 0) report(FILE_COMPETITION, null, '「チーム」の行がありません');
    if (divisions.length === 0) report(FILE_COMPETITION, null, '「部」の行がありません');
    if (stages.length === 0) report(FILE_COMPETITION, null, '「段」の行がありません');
  }

  /** @type {Map<string, number>} 「段/部」→ ゲーム数 */
  const gameCountByKey = new Map();
  /** @type {Map<string, number>} */
  const gameCountLine = new Map();
  for (const row of gameCountRows) {
    let ok = true;
    if (!stageByName.has(row.stage)) {
      report(
        FILE_COMPETITION,
        row.line,
        `ゲーム数の段「${row.stage}」は、この表の「段」にありません`
      );
      ok = false;
    }
    if (!divisionByName.has(row.division)) {
      report(
        FILE_COMPETITION,
        row.line,
        `ゲーム数の部「${row.division}」は、この表の「部」にありません`
      );
      ok = false;
    }
    const key = `${row.stage}/${row.division}`;
    if (ok && gameCountByKey.has(key)) {
      report(
        FILE_COMPETITION,
        row.line,
        `ゲーム数「${key}」が ${gameCountLine.get(key)}行目と重なっています`
      );
      ok = false;
    }
    if (!ok) continue;
    gameCountByKey.set(key, row.maxGameCount);
    gameCountLine.set(key, row.line);
  }

  // ---------------- 選手.csv ----------------
  const playerRows = readTable(FILE_PLAYERS, playersCsv, ['選手番号', '名前', 'チーム', '部']);
  /** @type {Map<number, { line: number, name: string, team: string | null, division: string | null }>} */
  const playerByNumber = new Map();
  /** @type {CompetitionPlan['players']} */
  const players = [];
  for (const row of playerRows) {
    const rawNumber = row.get('選手番号');
    const name = row.get('名前');
    const team = row.get('チーム');
    const division = row.get('部');
    let ok = true;
    const playerNumber = toPositiveInt(rawNumber);
    if (playerNumber === null) {
      report(FILE_PLAYERS, row.line, `選手番号は 1 以上の整数にしてください（「${rawNumber}」）`);
      ok = false;
    } else if (playerByNumber.has(playerNumber)) {
      report(
        FILE_PLAYERS,
        row.line,
        `選手番号 ${playerNumber} が ${playerByNumber.get(playerNumber)?.line}行目と重なっています`
      );
      ok = false;
    }
    if (name === '') {
      report(FILE_PLAYERS, row.line, '名前が空です');
      ok = false;
    }
    if (team !== '' && !teamByName.has(team)) {
      report(FILE_PLAYERS, row.line, `チーム「${team}」は ${FILE_COMPETITION} にありません`);
      ok = false;
    }
    if (division !== '' && !divisionByName.has(division)) {
      report(FILE_PLAYERS, row.line, `部「${division}」は ${FILE_COMPETITION} にありません`);
      ok = false;
    }
    if (!ok || playerNumber === null) continue;
    const entry = { line: row.line, name, team: team || null, division: division || null };
    playerByNumber.set(playerNumber, entry);
    players.push({ playerNumber, name, team: entry.team, division: entry.division });
  }

  // ---------------- 試合.csv ----------------
  const matchRows = readTable(FILE_MATCHES, matchesCsv, [
    '段',
    '対戦',
    '対戦の順番',
    'チームA',
    'チームB',
    '部',
    '対戦の中の順番',
    'コート',
    'コートの中の順番',
    'A1',
    'A2',
    'B1',
    'B2',
  ]);
  if (matchRows.length === 0 && problems.every((p) => !p.startsWith(FILE_MATCHES))) {
    report(FILE_MATCHES, null, '試合の行がありません');
  }

  const courtCount = courtCounts[0]?.courtCount ?? null;
  /** @type {Map<string, PlanMatchup & { line: number, rawA: string, rawB: string, matchOrders: Map<number, number> }>} */
  const matchupByKey = new Map();
  /** @type {Map<string, number>} 「コート:順番」→ 最初に書いた行 */
  const courtSlotLine = new Map();
  /** @type {Map<string, number>} 「段/部」→ 最初に使った行（ゲーム数が無いと報告する用） */
  const firstUseOfGameCount = new Map();
  /** @type {CompetitionPlan['emptySlots']} */
  const emptySlots = [];

  for (const row of matchRows) {
    const stageName = row.get('段');
    const roundName = row.get('対戦');
    const rawMatchupOrder = row.get('対戦の順番');
    const teamAName = row.get('チームA');
    const teamBName = row.get('チームB');
    const divisionName = row.get('部');
    const rawOrderInMatchup = row.get('対戦の中の順番');
    const rawCourt = row.get('コート');
    const rawOrderInCourt = row.get('コートの中の順番');
    const here = (/** @type {string} */ message) => report(FILE_MATCHES, row.line, message);

    // ---- 段・部 ----
    const stage = stageByName.get(stageName);
    if (!stage) here(`段「${stageName}」は ${FILE_COMPETITION} にありません`);
    if (!divisionByName.has(divisionName))
      here(`部「${divisionName}」は ${FILE_COMPETITION} にありません`);

    // ---- 対戦（同じ「段＋対戦」の行が 1 つの対戦になる） ----
    if (roundName === '') here('対戦の名前が空です');
    const matchupOrder = toPositiveInt(rawMatchupOrder);
    if (matchupOrder === null)
      here(`対戦の順番は 1 以上の整数にしてください（「${rawMatchupOrder}」）`);

    /** @type {(name: string) => { team: string } | { slot: string } | null} */
    const resolveSide = (name) => {
      if (name === '') return null;
      if (teamByName.has(name)) return { team: name };
      if (stage?.format === 'knockout') return { slot: name };
      return null;
    };
    for (const [label, name] of /** @type {const} */ ([
      ['チームA', teamAName],
      ['チームB', teamBName],
    ])) {
      if (name === '') here(`${label}が空です`);
      else if (!teamByName.has(name) && stage && stage.format !== 'knockout') {
        here(
          `${label}のチーム「${name}」は ${FILE_COMPETITION} にありません（空枠にできるのはトーナメントの段だけです）`
        );
      }
    }
    if (teamAName !== '' && teamAName === teamBName) here('チームAとチームBが同じです');

    const sideA = resolveSide(teamAName);
    const sideB = resolveSide(teamBName);

    const matchupKey = `${stageName}\u0000${roundName}`;
    let matchup = matchupByKey.get(matchupKey);
    if (!matchup) {
      matchup = {
        line: row.line,
        rawA: teamAName,
        rawB: teamBName,
        matchOrders: new Map(),
        stage: stageName,
        roundName,
        sortOrder: matchupOrder ?? 0,
        sideATeam: sideA && 'team' in sideA ? sideA.team : null,
        sideBTeam: sideB && 'team' in sideB ? sideB.team : null,
        sideASlotLabel: sideA && 'slot' in sideA ? sideA.slot : null,
        sideBSlotLabel: sideB && 'slot' in sideB ? sideB.slot : null,
        matches: [],
      };
      matchupByKey.set(matchupKey, matchup);
      for (const [side, resolved] of /** @type {const} */ ([
        ['a', sideA],
        ['b', sideB],
      ])) {
        if (
          resolved &&
          'slot' in resolved &&
          !emptySlots.some(
            (s) => s.stage === stageName && s.roundName === roundName && s.side === side
          )
        ) {
          emptySlots.push({ stage: stageName, roundName, side, label: resolved.slot });
        }
      }
    } else {
      // 同じ対戦の行どうしで、チームと順番が食い違っていたら止める
      const first = `${matchup.line}行目`;
      if (teamAName !== matchup.rawA)
        here(`${first}と同じ対戦なのに、チームAが違います（「${teamAName}」）`);
      if (teamBName !== matchup.rawB)
        here(`${first}と同じ対戦なのに、チームBが違います（「${teamBName}」）`);
      if (matchupOrder !== null && matchupOrder !== matchup.sortOrder)
        here(`${first}と同じ対戦なのに、対戦の順番が違います（「${rawMatchupOrder}」）`);
    }

    // ---- 試合 ----
    const orderInMatchup = toPositiveInt(rawOrderInMatchup);
    if (orderInMatchup === null) {
      here(`対戦の中の順番は 1 以上の整数にしてください（「${rawOrderInMatchup}」）`);
    } else if (matchup.matchOrders.has(orderInMatchup)) {
      here(
        `対戦の中の順番 ${orderInMatchup} が ${matchup.matchOrders.get(orderInMatchup)}行目と重なっています`
      );
    } else {
      matchup.matchOrders.set(orderInMatchup, row.line);
    }

    const court = toPositiveInt(rawCourt);
    if (court === null || (courtCount !== null && court > courtCount)) {
      here(
        courtCount !== null
          ? `コートは 1〜${courtCount} の整数にしてください（「${rawCourt}」）`
          : `コートは 1 以上の整数にしてください（「${rawCourt}」）`
      );
    }
    const orderInCourt = toPositiveInt(rawOrderInCourt);
    if (orderInCourt === null) {
      here(`コートの中の順番は 1 以上の整数にしてください（「${rawOrderInCourt}」）`);
    } else if (court !== null) {
      const slotKey = `${court}:${orderInCourt}`;
      if (courtSlotLine.has(slotKey)) {
        here(
          `コート ${court} の ${orderInCourt} 番目が ${courtSlotLine.get(slotKey)}行目と重なっています`
        );
      } else {
        courtSlotLine.set(slotKey, row.line);
      }
    }

    // ---- 出場者 ----
    /** @param {'A' | 'B'} sideLabel @param {string[]} cells @param {string | null} sideTeam */
    const readSide = (sideLabel, cells, sideTeam) => {
      const cellNames = [`${sideLabel}1`, `${sideLabel}2`];
      const filled = cells.filter((cell) => cell !== '');
      if (filled.length === 1) {
        here(
          `${cellNames[0]}・${cellNames[1]} は、両方書くか両方空にしてください（ペアの片方だけは入れられません）`
        );
      } else if (filled.length === 0 && stage?.format === 'league') {
        here(`リーグの試合では出場者を空にできません（${cellNames[0]}・${cellNames[1]}）`);
      }
      /** @type {number[]} */
      const numbers = [];
      for (const cell of filled) {
        const number = toPositiveInt(cell);
        const player = number === null ? undefined : playerByNumber.get(number);
        if (number === null || !player) {
          here(`選手番号 ${cell} が ${FILE_PLAYERS} にありません`);
          continue;
        }
        if (sideTeam !== null && player.team !== sideTeam) {
          here(
            `選手 ${number} はチーム「${player.team ?? '（なし）'}」の人です（${sideLabel} 側はチーム「${sideTeam}」）`
          );
        }
        if (player.division !== divisionName) {
          here(
            `選手 ${number} は部「${player.division ?? '（なし）'}」の人です（この試合は部「${divisionName}」）`
          );
        }
        numbers.push(number);
      }
      return numbers;
    };
    const a = readSide('A', [row.get('A1'), row.get('A2')], matchup.sideATeam);
    const b = readSide('B', [row.get('B1'), row.get('B2')], matchup.sideBTeam);
    const seen = new Set();
    for (const number of [...a, ...b]) {
      if (seen.has(number)) here(`選手 ${number} が同じ試合に 2 回書かれています`);
      seen.add(number);
    }

    // ---- ゲーム数 ----
    const gameCountKey = `${stageName}/${divisionName}`;
    const maxGameCount = gameCountByKey.get(gameCountKey);
    if (
      stage &&
      divisionByName.has(divisionName) &&
      maxGameCount === undefined &&
      !firstUseOfGameCount.has(gameCountKey)
    ) {
      here(`${FILE_COMPETITION} の「ゲーム数」に「${gameCountKey}」がありません`);
    }
    firstUseOfGameCount.set(gameCountKey, row.line);

    matchup.matches.push({
      division: divisionName,
      orderInMatchup: orderInMatchup ?? 0,
      courtNumber: court ?? 0,
      orderInCourt: orderInCourt ?? 0,
      maxGameCount: maxGameCount ?? 0,
      sideA: a,
      sideB: b,
    });
  }

  // ---- 対戦をまたぐ検査 ----
  const matchups = [...matchupByKey.values()];
  for (const stage of stages) {
    const inStage = matchups.filter((m) => m.stage === stage.name);
    if (stage.format === 'league') {
      // 同じ 2 チームの対戦が 2 つあると、星取表が 1 マスに 2 つ入る（#65 の約束）
      /** @type {Map<string, PlanMatchup & { line: number }>} */
      const pairs = new Map();
      for (const m of inStage) {
        if (!m.sideATeam || !m.sideBTeam) continue;
        const key = [m.sideATeam, m.sideBTeam].sort().join('\u0000');
        const earlier = pairs.get(key);
        if (earlier) {
          report(
            FILE_MATCHES,
            m.line,
            `リーグで「${m.sideATeam}」と「${m.sideBTeam}」の対戦が 2 つ以上あります（${earlier.line}行目にもあります）。同じ 2 チームの対戦は 1 つだけにしてください`
          );
        } else {
          pairs.set(key, m);
        }
      }
    } else if (stage.format === 'knockout') {
      // 画面は「並び順の 1・2 番目が準決勝、3 番目が決勝、4 番目が 3位決定戦」で決める
      if (inStage.length !== KNOCKOUT_MATCHUP_COUNT) {
        report(
          FILE_MATCHES,
          null,
          `トーナメントの段「${stage.name}」の対戦が ${inStage.length} つです。${KNOCKOUT_MATCHUP_COUNT} つ（準決勝2・決勝・3位決定戦）にしてください`
        );
      }
      /** @type {Map<number, number>} */
      const orderLine = new Map();
      for (const m of inStage) {
        const earlier = orderLine.get(m.sortOrder);
        if (earlier !== undefined) {
          report(
            FILE_MATCHES,
            m.line,
            `トーナメントの対戦の順番 ${m.sortOrder} が ${earlier}行目と重なっています（準決勝1→準決勝2→決勝→3位決定戦の順に、重ならない番号にしてください）`
          );
        } else {
          orderLine.set(m.sortOrder, m.line);
        }
      }
    }
  }

  if (problems.length > 0) return { problems, plan: null };

  const competition = competitions[0];
  const hall = halls[0];
  /** @type {CompetitionPlan} */
  const plan = {
    competition: { name: competition.name, heldOn: competition.heldOn },
    hall: { name: hall.name, courtCount: hall.courtCount },
    courtCount: /** @type {number} */ (courtCount),
    teams,
    divisions,
    stages,
    matchSettings: gameCountRows.map((row) => ({
      stage: row.stage,
      division: row.division,
      maxGameCount: row.maxGameCount,
    })),
    players,
    matchups: matchups.map((m) => ({
      stage: m.stage,
      roundName: m.roundName,
      sortOrder: m.sortOrder,
      sideATeam: m.sideATeam,
      sideBTeam: m.sideBTeam,
      sideASlotLabel: m.sideASlotLabel,
      sideBSlotLabel: m.sideBSlotLabel,
      matches: m.matches,
    })),
    emptySlots,
  };
  return { problems, plan };
}

/**
 * 確認の画面に出す件数の要約。
 * @param {CompetitionPlan} plan
 * @returns {string[]}
 */
export function summarizePlan(plan) {
  const matchCount = plan.matchups.reduce((sum, m) => sum + m.matches.length, 0);
  const lines = [
    `大会: ${plan.competition.name}（${plan.competition.heldOn}）`,
    `会場: ${plan.hall.name}（${plan.hall.courtCount} 面。今年押さえた面数 ${plan.courtCount}）`,
    `チーム ${plan.teams.length} / 部 ${plan.divisions.length} / 選手 ${plan.players.length} 人`,
  ];
  for (const stage of plan.stages) {
    const inStage = plan.matchups.filter((m) => m.stage === stage.name);
    lines.push(
      `段「${stage.name}」（${stage.format === 'league' ? 'リーグ' : 'トーナメント'}）: 対戦 ${inStage.length} / 試合 ${inStage.reduce((sum, m) => sum + m.matches.length, 0)}`
    );
  }
  lines.push(`試合の合計: ${matchCount}`);
  return lines;
}
