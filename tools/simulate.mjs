// 名字バトル — CPU どうしを何試合も戦わせて、数値のつり合いを確かめる
// 使い方: node tools/simulate.mjs [試合数] [--cards]
//   --cards  名字ごとの性能の一覧も出す
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/names.js', 'src/menko.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  + '\n;globalThis.__out = {M: Menko, D: MYOJI};';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const {M, D} = ctx.__out;

const args = process.argv.slice(2);
const N = +args.find(a => /^\d+$/.test(a)) || 2000;
const pct = x => (x * 100).toFixed(1) + '%';

if (args.includes('--cards')){
  const all = Object.keys(D.POP).map(n => M.stats(n, D)).sort((a, b) => b.power - a.power);
  console.log('名字\t威力\t重さ\t半径\t属性\tコスト');
  for (const c of all) console.log([c.name, c.power, c.weight, c.r, c.elem, c.cost].join('\t'));
  console.log('');
}

const R = {seed: 12345};
let rounds = 0, timeouts = 0, draws = 0, firstWins = 0, decided = 0, throws = 0, flips = 0, selfOut = 0, pushOut = 0, ownFlip = 0;
let strongerWins = 0, strongerN = 0;
const byElem = {}, byCost = {};
const tally = (o, k, win) => { (o[k] ??= {n: 0, w: 0}).n++; if (win) o[k].w++; };

for (let g = 0; g < N; g++){
  const team = () => { for (;;){ const p = D.PREFS[Math.floor(M.rand(R) * D.PREFS.length)]; const t = M.bestTeam(M.draw(p, 5, R, D)); if (t) return t; } };
  const a = team(), b = team();
  const S = M.newMatch(a, b, Math.floor(M.rand(R) * 2 ** 32));
  while (!S.over){
    const side = S.turn;
    const plan = M.cpuPlan(S, 0.75);
    const ev = M.throwCard(S, plan.id, plan.aim, plan.power);
    throws++;
    for (const e of ev){
      if (e.t === 'flip'){ const X = S.cards.find(c => c.id === e.id); if (X.side === side) ownFlip++; else flips++; }
      if (e.t === 'out'){ if (e.self) selfOut++; else pushOut++; }
    }
  }
  rounds += Math.min(S.round, M.ROUNDS);
  if (S.over.why === 'rounds') timeouts++;
  if (S.over.winner === 'draw'){ draws++; continue; }
  decided++;
  if (S.over.winner === S.first) firstWins++;
  const pw = t => t.reduce((s, c) => s + c.power, 0);
  if (pw(a) !== pw(b)){ strongerN++; if ((pw(a) > pw(b)) === (S.over.winner === 'me')) strongerWins++; }
  for (const c of S.cards){ const win = c.side === S.over.winner; tally(byElem, c.elem, win); tally(byCost, c.cost, win); }
}

console.log(`試合数 ${N}`);
console.log(`平均の回数 ${(rounds / N).toFixed(2)} / ${M.ROUNDS} ・ 回数切れ ${pct(timeouts / N)} ・ 引き分け ${pct(draws / N)}`);
console.log(`1投あたり: 相手をめくる ${(flips / throws).toFixed(2)}枚 ・ 味方をめくる ${(ownFlip / throws).toFixed(3)}枚 ・ 押し出し ${(pushOut / throws).toFixed(3)}枚 ・ 自分が場外 ${pct(selfOut / throws)}`);
console.log(`先に投げたほうの勝率 ${pct(firstWins / decided)}`);
console.log(`威力の合計が高いチームの勝率 ${pct(strongerWins / strongerN)}`);
console.log('属性ごとの勝率(その札がいたチームが勝った割合): ' + Object.entries(byElem).map(([k, v]) => `${k} ${pct(v.w / v.n)}(${v.n})`).join(' ・ '));
console.log('コストごとの勝率: ' + Object.entries(byCost).map(([k, v]) => `${k} ${pct(v.w / v.n)}(${v.n})`).join(' ・ '));
