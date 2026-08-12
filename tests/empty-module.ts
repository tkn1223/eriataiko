// server-only の差し替え先。
//
// 本番のビルドでは 'server-only' が「クライアントから import したら落ちる」壁として
// 働くが、テスト（node）から import すると同じ仕組みで落ちてしまう。
// テスト中だけこの空モジュールに置き換える（vitest.config.mts の alias）。
export {};
