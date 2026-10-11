// 検査済みの計画（competition-csv.mjs の CompetitionPlan）をデータベースに書き込む。
//
// **service_role の鍵を使うので、すべての制限を無視して書ける。** 呼ぶのは
// scripts/ の入口と、手元 DB を相手にしたテストだけ（画面・API からは呼ばない）。
// 鍵はこのファイルに書かない。環境変数から読む。
//
// 方針は「丸ごと入れ直し」:
//   - 同じ「大会名＋日付」の大会があれば、その行は残す（「いまの大会」の印を保つため）
//   - 点が 1 つでも入っている／始まった試合がある大会は、何も変えずに止める
//   - 止まらなければ、部・チーム・参加・段（その下の対戦・試合・出場者・ゲーム数設定）を消して入れ直す
// 途中で失敗しても、もう一度実行すれば同じ結果になる（消してから入れるため）。
import { createClient } from '@supabase/supabase-js';

/** 点や進み具合があって、入れ直せないときに投げる。画面にはメッセージをそのまま出す */
export class ImportBlockedError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ImportBlockedError';
  }
}

/**
 * 環境変数から admin クライアントを作る。
 * @param {Record<string, string | undefined>} env
 */
export function createAdminClientFromEnv(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要ります。\n' +
        '例: node --env-file=.env.local scripts/import-competition.mjs docs/import-sample'
    );
  }
  return { url, db: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

/** @typedef {import('@supabase/supabase-js').SupabaseClient} Db */
/** @typedef {import('./competition-csv.mjs').CompetitionPlan} CompetitionPlan */

/**
 * @template T
 * @param {{ data: T | null, error: { message: string } | null }} result
 * @param {string} what
 * @returns {T}
 */
function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return /** @type {T} */ (result.data);
}

/**
 * 行を入れて、入った行（id つき）を返す。件数が多くても 1 回の通信が大きくならないよう分ける。
 * @param {Db} db @param {string} table @param {Record<string, unknown>[]} rows
 * @returns {Promise<any[]>}
 */
async function insertAll(db, table, rows) {
  /** @type {any[]} */
  const inserted = [];
  for (let start = 0; start < rows.length; start += 200) {
    const chunk = rows.slice(start, start + 200);
    inserted.push(...must(await db.from(table).insert(chunk).select(), `${table} の追加`));
  }
  return inserted;
}

/**
 * その大会に「入れ直してはいけない理由」があるか調べる（読むだけ）。
 * @param {Db} db @param {string} competitionId
 * @returns {Promise<string | null>} 止める理由。入れ直してよければ null
 */
async function blockedReason(db, competitionId) {
  // 孫・ひ孫の表は、親をたどる絞り込み（!inner）で 1 回の問い合わせにする
  const scores = await db
    .from('game_scores')
    .select('id, matches!inner(matchups!inner(stages!inner(competition_id)))', {
      count: 'exact',
      head: true,
    })
    .eq('matches.matchups.stages.competition_id', competitionId);
  if (scores.error) throw new Error(`得点の確認: ${scores.error.message}`);
  if ((scores.count ?? 0) > 0) {
    return `この大会にはもう点が入っています（${scores.count} 件）。点が入った大会は入れ直せないので、何も書き換えずに止めました。`;
  }
  const started = await db
    .from('matches')
    .select('id, matchups!inner(stages!inner(competition_id))', { count: 'exact', head: true })
    .eq('matchups.stages.competition_id', competitionId)
    .neq('status', 'waiting');
  if (started.error) throw new Error(`試合の進み具合の確認: ${started.error.message}`);
  if ((started.count ?? 0) > 0) {
    return `この大会にはもう始まった試合があります（${started.count} 試合）。始まった大会は入れ直せないので、何も書き換えずに止めました。`;
  }
  return null;
}

/**
 * 同じ日付の大会を探し（同じ日に大会は 1 つだけとみなす。名前の誤字直しで大会が増えないように）、入れ直してよいか調べる（読むだけ。書き込む前の確認用）。
 * @param {Db} db @param {CompetitionPlan} plan
 * @returns {Promise<{ existingId: string | null, blockedReason: string | null }>}
 */
export async function checkImportable(db, plan) {
  const found = must(
    await db.from('competitions').select('id').eq('held_on', plan.competition.heldOn).limit(5),
    '大会の検索'
  );
  if (found.length > 1) {
    throw new ImportBlockedError(
      `${plan.competition.heldOn} の大会が ${found.length} 件あります。同じ日の大会は 1 件だけにしてから取り込んでください。`
    );
  }
  const existingId = found[0]?.id ?? null;
  return {
    existingId,
    blockedReason: existingId ? await blockedReason(db, existingId) : null,
  };
}

/**
 * 計画をデータベースに書き込む。
 * @param {Db} db @param {CompetitionPlan} plan
 * @returns {Promise<{ competitionId: string, replaced: boolean, counts: Record<string, number> }>}
 */
export async function importCompetition(db, plan) {
  const { existingId, blockedReason: reason } = await checkImportable(db, plan);
  if (reason) throw new ImportBlockedError(reason);

  // ---- 会場: 名前で探して、無ければ作る。面数は CSV の値に更新する ----
  const hallFound = must(
    await db.from('halls').select('id').eq('name', plan.hall.name).limit(1),
    '会場の検索'
  );
  let hallId = hallFound[0]?.id;
  if (hallId) {
    must(
      await db.from('halls').update({ court_count: plan.hall.courtCount }).eq('id', hallId),
      '会場の更新'
    );
  } else {
    hallId = (
      await insertAll(db, 'halls', [{ name: plan.hall.name, court_count: plan.hall.courtCount }])
    )[0].id;
  }

  // ---- 大会: あれば行を残して名前・会場・面数だけ更新（is_current を触らない） ----
  let competitionId = existingId;
  if (competitionId) {
    must(
      await db
        .from('competitions')
        // 名前も CSV の値に直す（日付で見分けているので、誤字直しがここで反映される）
        .update({ name: plan.competition.name, hall_id: hallId, court_count: plan.courtCount })
        .eq('id', competitionId),
      '大会の更新'
    );
    // 段を消すと、その下の対戦・試合・出場者・ゲーム数設定も一緒に消える（cascade）
    must(await db.from('stages').delete().eq('competition_id', competitionId), '段の削除');
    must(await db.from('participants').delete().eq('competition_id', competitionId), '参加の削除');
    must(await db.from('teams').delete().eq('competition_id', competitionId), 'チームの削除');
    must(await db.from('divisions').delete().eq('competition_id', competitionId), '部の削除');
  } else {
    competitionId = (
      await insertAll(db, 'competitions', [
        {
          name: plan.competition.name,
          held_on: plan.competition.heldOn,
          hall_id: hallId,
          court_count: plan.courtCount,
          is_current: false,
        },
      ])
    )[0].id;
  }

  // ---- 部・チーム・段・ゲーム数 ----
  const divisions = await insertAll(
    db,
    'divisions',
    plan.divisions.map((d) => ({
      competition_id: competitionId,
      name: d.name,
      sort_order: d.sortOrder,
    }))
  );
  const teams = await insertAll(
    db,
    'teams',
    plan.teams.map((t) => ({
      competition_id: competitionId,
      team_number: t.teamNumber,
      name: t.name,
      sort_order: t.sortOrder,
    }))
  );
  const stages = await insertAll(
    db,
    'stages',
    plan.stages.map((s) => ({
      competition_id: competitionId,
      name: s.name,
      format: s.format,
      sort_order: s.sortOrder,
    }))
  );
  const divisionId = (/** @type {string} */ name) => divisions.find((d) => d.name === name).id;
  const teamId = (/** @type {string} */ name) => teams.find((t) => t.name === name).id;
  const stageId = (/** @type {string} */ name) => stages.find((s) => s.name === name).id;

  await insertAll(
    db,
    'match_settings',
    plan.matchSettings.map((m) => ({
      stage_id: stageId(m.stage),
      division_id: divisionId(m.division),
      max_game_count: m.maxGameCount,
    }))
  );

  // ---- 選手: 番号で探して、無ければ作る・名前が違えば直す ----
  const numbers = plan.players.map((p) => p.playerNumber);
  /** @type {Map<number, { id: string, name: string }>} */
  const existingPlayers = new Map();
  for (let start = 0; start < numbers.length; start += 100) {
    const rows = must(
      await db
        .from('players')
        .select('id, player_number, name')
        .in('player_number', numbers.slice(start, start + 100))
        .limit(100),
      '選手の検索'
    );
    for (const row of rows) existingPlayers.set(row.player_number, row);
  }
  let renamed = 0;
  for (const player of plan.players) {
    const found = existingPlayers.get(player.playerNumber);
    if (found && found.name !== player.name) {
      must(
        await db.from('players').update({ name: player.name }).eq('id', found.id),
        '選手名の更新'
      );
      renamed++;
    }
  }
  const newPlayers = plan.players.filter((p) => !existingPlayers.has(p.playerNumber));
  const createdPlayers = await insertAll(
    db,
    'players',
    newPlayers.map((p) => ({ player_number: p.playerNumber, name: p.name }))
  );
  /** @type {Map<number, string>} */
  const playerIdByNumber = new Map([
    ...[...existingPlayers].map(
      ([number, row]) => /** @type {[number, string]} */ ([number, row.id])
    ),
    ...createdPlayers.map((row) => /** @type {[number, string]} */ ([row.player_number, row.id])),
  ]);

  // ---- 参加（試合に出ない係の人はチーム・部が空のまま入る） ----
  const participants = await insertAll(
    db,
    'participants',
    plan.players.map((p) => ({
      competition_id: competitionId,
      player_id: playerIdByNumber.get(p.playerNumber),
      team_id: p.team ? teamId(p.team) : null,
      division_id: p.division ? divisionId(p.division) : null,
    }))
  );
  /** @type {Map<number, string>} */
  const participantIdByNumber = new Map(
    plan.players.map((p) => [
      p.playerNumber,
      participants.find((row) => row.player_id === playerIdByNumber.get(p.playerNumber)).id,
    ])
  );

  // ---- 対戦 ----
  const matchups = await insertAll(
    db,
    'matchups',
    plan.matchups.map((m) => ({
      stage_id: stageId(m.stage),
      round_name: m.roundName,
      sort_order: m.sortOrder,
      side_a_team_id: m.sideATeam ? teamId(m.sideATeam) : null,
      side_b_team_id: m.sideBTeam ? teamId(m.sideBTeam) : null,
      side_a_slot_label: m.sideASlotLabel,
      side_b_slot_label: m.sideBSlotLabel,
    }))
  );
  const matchupId = (/** @type {import('./competition-csv.mjs').PlanMatchup} */ m) =>
    matchups.find((row) => row.stage_id === stageId(m.stage) && row.round_name === m.roundName).id;

  // ---- 試合（ゲーム数は大会.csv の値をここでコピーする） ----
  const matchRows = plan.matchups.flatMap((m) =>
    m.matches.map((match) => ({
      matchup_id: matchupId(m),
      division_id: divisionId(match.division),
      order_in_matchup: match.orderInMatchup,
      court_number: match.courtNumber,
      order_in_court: match.orderInCourt,
      max_game_count: match.maxGameCount,
    }))
  );
  const matches = await insertAll(db, 'matches', matchRows);

  // ---- 出場者 ----
  const playerRows = plan.matchups.flatMap((m) =>
    m.matches.flatMap((match) => {
      const matchId = matches.find(
        (row) => row.matchup_id === matchupId(m) && row.order_in_matchup === match.orderInMatchup
      ).id;
      return [
        ...match.sideA.map((number, index) => ({ side: 'a', number, index })),
        ...match.sideB.map((number, index) => ({ side: 'b', number, index })),
      ].map(({ side, number, index }) => ({
        match_id: matchId,
        side,
        participant_id: participantIdByNumber.get(number),
        order_in_pair: index + 1,
      }));
    })
  );
  await insertAll(db, 'match_players', playerRows);

  return {
    competitionId,
    replaced: existingId !== null,
    counts: {
      部: divisions.length,
      チーム: teams.length,
      段: stages.length,
      選手: plan.players.length,
      新しく作った選手: createdPlayers.length,
      名前を直した選手: renamed,
      対戦: matchups.length,
      試合: matches.length,
      出場者: playerRows.length,
    },
  };
}

/**
 * 「いまの大会」の印を、その日付の大会に移す。外す → 付ける の順（印は同時に 1 つしか付けられないため）。
 * @param {Db} db @param {string} heldOn YYYY-MM-DD
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function setCurrentCompetition(db, heldOn) {
  const found = must(
    await db.from('competitions').select('id, name, is_current').eq('held_on', heldOn).limit(5),
    '大会の検索'
  );
  if (found.length === 0) throw new Error(`${heldOn} の大会がありません。先に取り込んでください。`);
  if (found.length > 1) {
    throw new Error(
      `${heldOn} の大会が ${found.length} 件あります（${found.map((c) => `「${c.name}」`).join('・')}）。どれか分からないので止めました。`
    );
  }
  const target = found[0];
  if (target.is_current) return { id: target.id, name: target.name };

  must(
    await db.from('competitions').update({ is_current: false }).eq('is_current', true),
    '印を外す'
  );
  must(
    await db.from('competitions').update({ is_current: true }).eq('id', target.id),
    '印を付ける'
  );
  return { id: target.id, name: target.name };
}
