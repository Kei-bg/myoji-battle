# 名字バトル — 開発メモ(Claude Code 向け)

土地(市町村)を選ぶと、そこに住む人の割合で名字が引け、その名字の札でメンコ勝負する、スマホ向けのブラウザゲーム。
今は **CPU と戦うメンコのプロトタイプ**。最終目標は、知らない人とマッチングして戦うオンライン版。

- 企画の全体: Obsidian の vault `G:\My Drive\claude_obsidian\名字バトル 企画案.md`(データの調査は `名字バトル 名字データ調査.md`)
- 決まりと数値: `docs/DESIGN.md`。**数値を変えたら DESIGN.md も直す**

## 動かし方

- ブラウザで遊ぶ: `index.html` を直接開くか、`npm start`(http://localhost:5174)
- 見た目の確認用: `index.html?auto`(自分の側も CPU が投げる)、`?theme=dark|light`、`?auto&pref=tokyo`
- つり合いを確かめる: `npm run sim`(= `node tools/simulate.mjs 3000`)。`--cards` で名字ごとの性能一覧
  - **決まりや数値を変えたら、必ず sim を回して前後を比べる**
- ビルド工程・依存パッケージはない。素の HTML / CSS / JavaScript
- PC(Windows)には node が無い。VS Code 同梱の Electron を node として使う:
  `ELECTRON_RUN_AS_NODE=1 "$LOCALAPPDATA/Programs/Microsoft VS Code/Code.exe" tools/simulate.mjs 3000`
- 見た目は Edge のヘッドレスで撮れる。描画幅が最小 504px なので、スマホ幅は 390px の iframe を並べたページを作って撮る(`--allow-file-access-from-files` を付けると iframe の中を操作できる)

## ファイル構成

```
index.html          画面の骨組み(はじめ・引いた札・対戦・結果)
src/names.js        名字の仮データ(MYOJI)。漢字の画数と属性、名字の読みと全国の人数、都道府県ごとの割合
src/menko.js        メンコの決まり(Menko)。DOM を使わない。ブラウザ・sim・将来のサーバーで共通
src/app.js          画面と操作。canvas の描画、指の操作、動き
src/style.css       見た目。色はすべて :root のトークン。canvas の色もここから読む
tools/simulate.mjs  CPU どうしを戦わせる sim。node:vm で names.js と menko.js を読む
docs/DESIGN.md      決まりと数値
```

## 守ってほしい決まり

- **menko.js に DOM や画面の都合を入れない**。オンライン化のとき、そのままサーバーで当たり判定に使う
- 乱数は必ず `Menko.rand(S)`(状態の種から取る)。`Math.random` を menko.js で使わない
- `throwCard` は起きたことを出来事の配列で返し、画面はそれを見て動きを付ける。新しい出来事を足したら app.js の `play` と `describe` にも足す
- 名字を足すときは、`N`(読み・人数)と、使っている漢字すべての `K`(画数・属性)を足す。足りないと `stats` がエラーを出す
- 文言は日本語。プレイヤー視点の言葉を使う
- 色は `style.css` の `:root` トークン経由。ライト/ダーク両方で確かめる

## 名字データについて

- `src/names.js` は **Claude が一般的な知識から作った仮の値**。実際の統計ではない
- 名字由来net の規約では、サイトから自動で集める(スクレイピング)のは事前の許可なしでは禁止(第13条2項)。転載も禁止。**商用でなくても、サイトから写して使わない**。使うなら許可を取るか購入する

## 次の候補

1. 本物の名字データ(許可が取れたら)に差し替えて、sim で見直す
2. オンライン対戦: menko.js をサーバー(WebSocket の対戦部屋)で動かし、スマホからは「どの札・狙い・勢い」だけ送る
3. 名字図鑑・日本地図の塗りつぶし
4. 総選挙と必殺技
