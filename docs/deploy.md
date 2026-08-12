# 公開の流れと、その準備

## 流れ

**テストは自動。公開は手動。マージしても公開されません。**

```
feature/なにか
   │  PR を作る ──► テストが自動で走る（約5分）
   ▼
develop ──────────► テスト（公開はしない）
   │  PR を作る
   ▼
main ─────────────► テスト（公開はしない）


公開したいとき ──► Actions の「公開する」を押す
                     どこに出す？ [確認用 / 本番]
```

覚えることは 3 つだけ。

- **作業は `develop` から枝を切って、`develop` に戻す**
- **本番に出したくなったら `develop` → `main` の PR を作る**
- **公開はボタンを押したときだけ起きる**

## 公開のしかた

1. GitHub の `Actions` タブ → 左の一覧から **`公開する`**
2. `Run workflow` を押す
3. `Use workflow from` … **本番に出すなら `main`**
4. `どこに出す？` … `確認用` か `本番`
5. `Run workflow` を押す

### 押したあとに起きること

まず「**そのコミットのテストが緑か**」を数秒で確かめます。

| テストの状態 | どうなるか |
| --- | --- |
| 緑 | そのまま公開に進む（約2分） |
| 赤 | 公開せずに止まる |
| まだ走っていない | 公開せずに止まる |

**テストを走らせ直しはしません。** マージのときに走っているので、結果を見るだけです。
待ち時間を増やさないためにこうしています。

### なぜマージで公開しないのか

以前はマージするたびに公開まで走っていました。**ほとんどの場合は公開したくないのに
毎回 5 分待たされる**ので分けました。

公開は「いま出す」と決めたときだけの行為なので、そのときだけ押します。

### なぜ「本番」は main からしか選べないのか

`Use workflow from`（どの枝の中身を出すか）と `どこに出す？`（本番か確認用か）は
**別の選択**です。だから「作業中の枝の中身を本番に出す」が指定できてしまいます。

それを防ぐため、`本番` を選んだのに枝が `main` でないときは、公開せずに止まります。

### なぜ Vercel の自動デプロイを使わないのか

Vercel を GitHub に繋ぐだけでも公開はできますが、それだと**マージした瞬間に、
テストが落ちていても公開されます。**
なので `vercel.json` の `git.deploymentEnabled` を `false` にして自動デプロイを止め、
ボタンを押したときだけ GitHub Actions から公開しています。

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

当日バックアップ用の 4 つ（`BACKUP_SECRET` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` /
`GOOGLE_PRIVATE_KEY` / `BACKUP_SPREADSHEET_ID`）も同じ場所に入れます。手順は `docs/backup.md`。

### ★「秘匿（Sensitive）」にしてはいけない値がある ★

Vercel の環境変数には「秘匿」という設定があり、**`vercel env add` で追加すると既定で秘匿になります。**
秘匿にすると、その値は**あとから取り出せなくなります**。`vercel pull`（Vercel から値を
手元に持ってくるコマンド）を実行しても、本当の値ではなく `[SENSITIVE]` という文字が入ります。

問題はここからです。**`NEXT_PUBLIC_` で始まる値だけは、ビルドのときにアプリの中へ
そのまま焼き込まれます。** ブラウザ（利用者の端末）に配る必要がある値なので、
「動かすとき」ではなく「作るとき」に本物が要るのです。

つまり `NEXT_PUBLIC_...` を秘匿にすると、ビルドが受け取るのは `[SENSITIVE]` という文字です。
それがアプリに焼き付いたまま公開され、**本番がデータベースに繋がらなくなります。**
実際に一度この状態になりました。テストは通り、公開も成功し、画面だけがデータを出さないので
原因に気づきにくい種類の事故です。

そのため次の 2 つは**秘匿を外して**登録し直しました。どちらもブラウザに配られる
公開前提の値なので、隠しても意味がありません。

```bash
vercel env rm  NEXT_PUBLIC_SUPABASE_URL      production
vercel env add NEXT_PUBLIC_SUPABASE_URL      production --no-sensitive
vercel env rm  NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --no-sensitive
```

**それ以外の値（`SUPABASE_SERVICE_ROLE_KEY` / `SESSION_SECRET` / `TOURNAMENT_PASSCODE` /
バックアップ用の 4 つ）は秘匿のままでよいです。** これらはビルドではなく、
アプリが動いているサーバーに実行時に渡される値なので、`vercel pull` で取り出せなくても困りません。

確認したいときは値を手元に落として見比べます。`NEXT_PUBLIC_` の 2 つが `[SENSITIVE]` に
なっていたら、上のコマンドで入れ直してから再デプロイしてください。

```bash
vercel env pull .env.vercel-check --environment=production
```

（`.env*` は `.gitignore` 済みなのでコミットされません。見終わったら消してください）

### 3. GitHub に 3 つ登録する

リポジトリの **Settings > Secrets and variables > Actions**、`Secrets` タブで `New repository secret`。

| 名前 | 中身 |
| --- | --- |
| `VERCEL_TOKEN` | Vercel の Account Settings > Tokens で作ったトークン（**Scope は `Full Account`**） |
| `VERCEL_ORG_ID` | `.vercel/project.json` の `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` の `projectId` |

後ろの 2 つはコマンドで入れられます。

```bash
jq -r .orgId     .vercel/project.json | tr -d '\n' | gh secret set VERCEL_ORG_ID
jq -r .projectId .vercel/project.json | tr -d '\n' | gh secret set VERCEL_PROJECT_ID
```

`VERCEL_TOKEN` は**ブラウザで作るしかありません**（CLI からは作れず、`403 Cannot create
tokens for this app.` になる）。https://vercel.com/account/tokens で作ります。

**Scope は必ず `Full Account` にしてください。** 権限を絞ってチーム（`catachi`）を選ぶと、
プロジェクト設定は読めるのに `vercel pull` が
`Could not retrieve Project Settings` で失敗します。CLI が内部でアカウント情報を
照会するため、チーム限定のトークンでは動きません（実際にこれで詰まった）。

作ったらコピーして、**値を画面に出さずに**登録します。

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

---

## URL が 2 種類あることに注意

Vercel は公開のたびに**その回だけの URL**（`eriataiko-xxxxxxx-catachi.vercel.app`）を作ります。
これには**ログインの壁がかかっていて、関係者は開けません。** Actions の実行画面に出るのはこれです。

関係者に配るのは、**固定の URL** のほうです。こちらは誰でも開けます。

| 用途 | URL |
| --- | --- |
| 本番（関係者に配る） | https://eriataiko.vercel.app |
| 確認用（`PREVIEW_ALIAS` を設定した場合） | そこで決めた URL |
| その回だけ（ログインが必要。開発者が中を見る用） | Actions の実行画面に出るもの |

「公開したのに開けない」ときは、その回だけの URL を踏んでいないか確認してください。

なお**プロジェクトの一番最初の公開だけは、`develop` から出しても本番になります**（Vercel の仕様）。
2 回目以降は指定どおり本番／確認用に分かれます。

---

## うまくいかないとき

### 「Vercel の設定が足りません」で止まる

上の手順 3 が終わっていません。Secrets を 3 つ入れてから、Actions の画面で
失敗した実行を `Re-run jobs` してください。

### テストは通るのに公開が失敗する

Vercel 側の環境変数が足りていない可能性が高いです（手順 2）。
ビルド時に必要なものが欠けていると、そこで落ちます。

### 公開は成功したのに、本番でデータが出ない・繋がらない

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が Vercel で
「秘匿（Sensitive）」になっていないか確認してください。手順 2 の
「秘匿にしてはいけない値がある」を読んでください。実際にこれで詰まったことがあります。

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
