import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, test } from 'vitest';

/**
 * このアプリで一番守りたい約束のテスト。
 *
 *   ブラウザに配っている鍵（anon）では、データを **読めるだけ**。
 *   書き換え・追加・削除は一切できない。
 *
 * この鍵は URL を知っている人なら誰でも取り出せるので、
 * ここが破れると誰でも得点を書き換えられる。
 * 新しいテーブルを足したら、必ずこのファイルに 1 件テストを足すこと。
 *
 * 実行前に `npx supabase start` が必要。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

describe('anon（ブラウザに配る鍵）でできること・できないこと', () => {
  beforeAll(async () => {
    // 読み取りテストのために 1 件だけ用意する
    const { error } = await admin
      .from('operators')
      .upsert({ name: 'テスト運営', display_order: 999 }, { onConflict: 'name' })
      .select();
    // name に一意制約が無い場合は upsert が使えないので、無ければ insert する
    if (error) {
      const { count } = await admin.from('operators').select('*', { count: 'exact', head: true });
      if (!count) await admin.from('operators').insert({ name: 'テスト運営', display_order: 999 });
    }
  });

  test('operators は読める（入場画面が名前一覧を出すため）', async () => {
    const { data, error } = await anon.from('operators').select('id, name').limit(10);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test('operators は追加できない', async () => {
    const { error } = await anon.from('operators').insert({ name: '勝手に追加' });
    expect(error).not.toBeNull();
  });

  test('operators は書き換えられない', async () => {
    const { data: before } = await admin.from('operators').select('id, name').limit(1);
    const target = before?.[0];
    expect(target).toBeDefined();

    await anon.from('operators').update({ name: '書き換えた' }).eq('id', target!.id);

    // エラーの有無ではなく「実際に変わっていないこと」を確かめる。
    // RLS で対象行が 0 件になると、エラーを返さず何もしない場合があるため。
    const { data: after } = await admin
      .from('operators')
      .select('name')
      .eq('id', target!.id)
      .single();
    expect(after?.name).toBe(target!.name);
  });

  test('operators は削除できない', async () => {
    const { data: before } = await admin.from('operators').select('*', { count: 'exact' });
    const countBefore = before?.length ?? 0;

    await anon.from('operators').delete().neq('name', '');

    const { data: after } = await admin.from('operators').select('*', { count: 'exact' });
    expect(after?.length ?? 0).toBe(countBefore);
  });

  test('write_logs は読めない（誰が何をしたかの記録なので隠す）', async () => {
    const { data, error } = await anon.from('write_logs').select('*').limit(1);
    // ポリシーが無いので、エラーになるか 0 件になる。どちらでも「見えていない」
    const leaked = !error && (data?.length ?? 0) > 0;
    expect(leaked).toBe(false);
  });
});
