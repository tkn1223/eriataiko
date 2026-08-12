# 公開の流れと、その準備

## 流れ

```
feature/なにか
   │  PR を作る ──► テストが自動で走る（約5分）
   ▼
develop ──────────► テスト ──► 確認用URL に公開
   │  PR を作る
   ▼
main ─────────────► テスト ──► 本番URL に公開
```

覚えることは 2 つだけ。

- **作業は `develop` から枝を切って、`develop` に戻す**
- **本番に出したくなったら `develop` → `main` の PR を作る**

テストが赤いときは公開されません。落ちたまま本番に出ることはありません。

### なぜ Vercel の自動デプロイを使わないのか

Vercel を GitHub に繋ぐだけでも公開はできますが、それだと**テストが落ちていても公開されます。**
なので `vercel.json` の `git.deploymentEnabled` を `false` にして自動デプロイを止め、
テストが通ったあとに GitHub Actions から公開しています。

`deploymentEnabled` を `true` に戻すと、二重に公開されて事故ります。戻さないこと。

---

## 準備（初回だけ・人間がやる）

### 1. Vercel にプロジェクトを作る

```bash
npm i -g vercel
vercel login
vercel link      # 「既存のプロジェクトを使う？」→ No で新規作成
```

`vercel link` が成功すると `.vercel/project.json` ができます。中身:

```json
{ "orgId": "team_xxxxx", "projectId": "prj_xxxxx" }
```

この 2 つの値を次で使います。`.vercel/` は `.gitignore` 済みなのでコミットされません。

### 2. Vercel 側に環境変数を入れる

Vercel の Project Settings > Environment Variables で、**Production と Preview の両方**に入れます。

| 名前 | 中身 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public キー |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（**絶対に人に見せない**） |
| `SESSION_SECRET` | 長いランダム文字列。`openssl rand -base64 32` で作る |
| `TOURNAMENT_PASSCODE` | 参加者に配る合言葉 |

**Production と Preview で `SESSION_SECRET` と `TOURNAMENT_PASSCODE` は別の値にしてください。**
確認用の合言葉が漏れても本番に入られないようにするためです。

環境変数は GitHub ではなく Vercel に置きます。公開リポジトリなので、GitHub 側には
デプロイに必要な最小限（次の 3 つ）しか置きません。

### 3. GitHub に 3 つ登録する

リポジトリの **Settings > Secrets and variables > Actions**、`Secrets` タブで `New repository secret`。

| 名前 | 中身 |
| --- | --- |
| `VERCEL_TOKEN` | Vercel の Account Settings > Tokens で作ったトークン |
| `VERCEL_ORG_ID` | `.vercel/project.json` の `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` の `projectId` |

後ろの 2 つはコマンドで入れられます。

```bash
jq -r .orgId     .vercel/project.json | tr -d '\n' | gh secret set VERCEL_ORG_ID
jq -r .projectId .vercel/project.json | tr -d '\n' | gh secret set VERCEL_PROJECT_ID
```

`VERCEL_TOKEN` は**ブラウザで作るしかありません**（CLI からは作れず、`403 Cannot create
tokens for this app.` になる）。https://vercel.com/account/tokens で作ってコピーし、
**値を画面に出さずに**登録します。

```bash
pbpaste | gh secret set VERCEL_TOKEN
```

`--body` で直接書くと、シェルの履歴や画面のログに残ります。使わないこと。

### 4. 確認用の URL を固定する（任意・おすすめ）

なにもしないと、`develop` に入れるたびに確認用 URL が変わります。毎回リンクを探すのが面倒なので、
固定の URL を決めておくと楽です。

同じ画面の `Variables` タブで `New repository variable`:

| 名前 | 中身の例 |
| --- | --- |
| `PREVIEW_ALIAS` | `eriataiko-dev.vercel.app` |

```bash
gh variable set PREVIEW_ALIAS --body eriataiko-dev.vercel.app
```

空のままでも動きます。その場合は公開後の URL が Actions の実行画面（Summary）に出るので、
そこから開いてください。

### 5. `develop` を既定のブランチにする（任意）

こうすると PR を作るときの宛先が自動で `develop` になり、間違って本番に PR を出しにくくなります。

```bash
gh repo edit --default-branch develop
```

---

## うまくいかないとき

### 「Vercel の設定が足りません」で止まる

上の手順 3 が終わっていません。Secrets を 3 つ入れてから、Actions の画面で
失敗した実行を `Re-run jobs` してください。

### テストは通るのに公開が失敗する

Vercel 側の環境変数が足りていない可能性が高いです（手順 2）。
ビルド時に必要なものが欠けていると、そこで落ちます。

### 確認用に出したいだけなのに本番に出てしまった

`main` に入れると本番です。`develop` に入れたか確認してください。

```bash
git branch --show-current
```

### スキーマ（表のつくり）の変更は自動では反映されない

コードの公開と DB の変更は別です。表を足したり変えたりしたときは、人間が手で流します。

```bash
npm run db:push
```

**先に DB、あとからコード**の順にしてください。逆にすると、まだ無い表を読もうとして
画面がエラーになります。
