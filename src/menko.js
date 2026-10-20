/* 名字バトル — メンコの決まり
   DOM を使わない。ブラウザ・sim・将来のオンライン用サーバーで同じものを使う。
   乱数は状態 S.seed から取るので、同じ種と同じ操作なら同じ結果になる。 */
const Menko = (() => {
'use strict';

/* ===== 定数 ===== */
const W = 360, H = 560;                 // 場の大きさ(論理単位。画面では縮尺して描く)
const TEAM = 3, COST_CAP = 10, ROUNDS = 10;
const MAX_THROW = 440;                  // 投げられる最大の距離
const RADIUS = [0, 24, 30, 36, 40];     // 字数 → 札の半径
const BEATS = {木:'土', 土:'水', 水:'火', 火:'金', 金:'木'}; // 相克: 左が右に強い
const ELEM_UP = 1.1, ELEM_DOWN = 0.92;
const FIRE_POWER = 3, EARTH_WEIGHT = 2;   // 属性の持ち味: 火は威力、土は重さが少し上がる
const PUSH = 26;                        // めくれなかった札が動く最大の距離
const FIRST_CAP = 0.5;                  // 試合の1投目の勢いの上限
const CHEER_POWER = 1, CHEER_WEIGHT = 0.5;    // 余ったコスト1につき

/* ===== 乱数 ===== */
function rand(S){
  let t = (S.seed = (S.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/* ===== 名字 → 札の性能 ===== */
// 威力 = 全国での珍しさ、重さ = 画数、大きさ = 字数、属性 = 最初に五行を持つ字。コストは威力で決まる
function stats(name, D){
  const chars = [...name];
  let strokes = 0, elem = '無';
  for (const ch of chars){
    const k = D.K[ch];
    if (!k) throw new Error('漢字の表にない字: ' + ch + '(' + name + ')');
    strokes += k[0];
    if (elem === '無' && k[1]) elem = k[1];
  }
  const pop = D.POP[name];
  if (!pop) throw new Error('人数のない名字: ' + name);
  const power = Math.round(32 + 10 * Math.log10(2e6 / pop)) + (elem === '火' ? FIRE_POWER : 0);
  const cost = power <= 36 ? 1 : power <= 42 ? 2 : power <= 48 ? 3 : power <= 54 ? 4 : 5;
  return {name, reading: D.READ[name], pop, strokes, power, weight: Math.round(20 + 0.3 * strokes) + (elem === '土' ? EARTH_WEIGHT : 0),
          r: RADIUS[Math.min(chars.length, 4)], len: chars.length, elem, cost};
}

/* ===== ガチャ ===== */
// その土地での割合に応じて、同じ名字が重ならないように n 枚引く
function draw(pref, n, R, D){
  const pool = Object.entries(pref.w).map(([name, w]) => ({name, w}));
  const out = [];
  while (out.length < n && pool.length){
    let x = rand(R) * pool.reduce((s, p) => s + p.w, 0), i = 0;
    for (; i < pool.length - 1; i++){ x -= pool[i].w; if (x < 0) break; }
    out.push(stats(pool[i].name, D));
    pool.splice(i, 1);
  }
  return out;
}

// コストの上限に収まる3枚のうち、応援を足していちばん強い組み合わせ(CPU 用)。組めなければ null
function bestTeam(cards, cap = COST_CAP){
  let best = null, bv = -1;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++){
    const t = [cards[i], cards[j], cards[k]];
    if (t.reduce((s, c) => s + c.cost, 0) > cap) continue;
    const v = cheer(t).reduce((s, c) => s + c.power + c.weight * 0.6, 0);
    if (v > bv){ bv = v; best = t; }
  }
  return best;
}

// 応援: コストの上限まで余った分だけ、チーム全員の威力と重さが上がる(よくある名字の「数の力」)
function cheerOf(team){ return Math.max(0, COST_CAP - team.reduce((s, c) => s + c.cost, 0)); }
function cheer(team){
  const n = cheerOf(team);
  return team.map(c => ({...c, cheer: n, power: c.power + n * CHEER_POWER, weight: c.weight + n * CHEER_WEIGHT}));
}

/* ===== 試合 ===== */
// side は 'me'(画面の下) と 'cpu'(上)。先に投げるほうは乱数で決める
function newMatch(teamMe, teamCpu, seed){
  const S = {seed: seed >>> 0, cards: [], turn: null, first: null, round: 1, over: null, throws: 0};
  const place = (team, side, y) => cheer(team).forEach((c, i) =>
    S.cards.push({...c, id: side + i, side, x: W * (i + 1) / (team.length + 1), y, alive: true}));
  place(teamMe, 'me', H - 90);
  place(teamCpu, 'cpu', 90);
  S.first = S.turn = rand(S) < 0.5 ? 'me' : 'cpu';
  return S;
}

const inside = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
const other = side => side === 'me' ? 'cpu' : 'me';

function elemMul(a, b){
  if (BEATS[a] === b) return ELEM_UP;
  if (BEATS[b] === a) return ELEM_DOWN;
  return 1;
}

// 投げる距離を上限までに縮めた着地の狙い
function reach(T, aim){
  const dx = aim.x - T.x, dy = aim.y - T.y, d = Math.hypot(dx, dy);
  if (d <= MAX_THROW) return {x: aim.x, y: aim.y};
  return {x: T.x + dx / d * MAX_THROW, y: T.y + dy / d * MAX_THROW};
}
// 遠くに投げるほど、狙いからぶれる
const scatterOf = dist => 5 + dist * 0.05;

// T が L に落ちたとき、X をめくる力(乱数の前)。X の縁の近くに落ちるほど強い
function force(T, L, X, power){
  const d = Math.hypot(X.x - L.x, X.y - L.y);
  const reachR = 0.75 * T.r + 0.55 * X.r;           // 大きい札は当てやすく、狙われやすい
  const g = Math.abs(d - X.r);
  if (g >= reachR) return 0;
  const edge = 1 - g / reachR;
  return T.power * (0.35 + 0.65 * power) * edge * elemMul(T.elem, X.elem);
}
// 力 f で重さ w の札がめくれる確率(乱数は f に 0.85〜1.15 倍がかかる)
function flipChance(f, w){
  if (f <= 0) return 0;
  return Math.max(0, Math.min(1, (1.15 - w / f) / 0.3));
}

// 1回投げる。起きたことを順に並べた出来事の配列を返す(画面はこれを見て動きを付ける)
function throwCard(S, id, aim, power){
  const T = S.cards.find(c => c.id === id);
  if (S.over || !T || !T.alive || T.side !== S.turn) return null;
  power = Math.max(0, Math.min(S.throws === 0 ? FIRST_CAP : 1, power));   // 1投目は様子見(先に投げる有利を消す)
  const a = reach(T, aim);
  const sc = scatterOf(Math.hypot(a.x - T.x, a.y - T.y));
  const ang = rand(S) * Math.PI * 2, rr = sc * Math.sqrt(rand(S));
  const L = {x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr};
  const ev = [{t: 'fly', id, from: {x: T.x, y: T.y}, to: {...L}, power}];
  T.x = L.x; T.y = L.y;
  S.throws++;

  if (!inside(L)){
    T.alive = false;
    ev.push({t: 'out', id, self: true, x: L.x, y: L.y});
  } else {
    ev.push({t: 'hit', x: L.x, y: L.y, power});
    for (const X of S.cards){
      if (X === T || !X.alive) continue;
      const f = force(T, L, X, power);
      if (f <= 0) continue;
      const hit = f * (0.85 + 0.3 * rand(S));
      if (hit > X.weight){
        X.alive = false;
        ev.push({t: 'flip', id: X.id, by: id});
        continue;
      }
      // めくれなくても、衝撃で外へ少し動く
      const d = Math.hypot(X.x - L.x, X.y - L.y);
      const u = d > 0.5 ? {x: (X.x - L.x) / d, y: (X.y - L.y) / d} : unit(rand(S) * Math.PI * 2);
      const push = PUSH * hit / X.weight;
      X.x += u.x * push; X.y += u.y * push;
      if (!inside(X)){
        X.alive = false;
        ev.push({t: 'out', id: X.id, x: X.x, y: X.y});
      }
    }
    settle(S, T);
  }
  ev.push({t: 'settle', pos: S.cards.filter(c => c.alive).map(c => ({id: c.id, x: c.x, y: c.y}))});
  endTurn(S, ev);
  return ev;
}

const unit = a => ({x: Math.cos(a), y: Math.sin(a)});

// 重なった札を離す。投げた札 T は自分だけ動き、ほかは半分ずつ動く
function settle(S, T){
  const live = S.cards.filter(c => c.alive);
  for (let it = 0; it < 6; it++){
    let moved = false;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++){
      const A = live[i], B = live[j];
      let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      const need = A.r + B.r - 4;
      if (d >= need) continue;
      if (d < 0.01){ dx = 1; dy = 0; d = 1; }
      const over = need - d, ux = dx / d, uy = dy / d;
      const wa = A === T ? 1 : B === T ? 0 : 0.5;
      A.x -= ux * over * wa; A.y -= uy * over * wa;
      B.x += ux * over * (1 - wa); B.y += uy * over * (1 - wa);
      moved = true;
    }
    for (const c of live){ c.x = Math.max(0, Math.min(W, c.x)); c.y = Math.max(0, Math.min(H, c.y)); }
    if (!moved) break;
  }
}

function endTurn(S, ev){
  const left = side => S.cards.filter(c => c.alive && c.side === side).length;
  const me = left('me'), cpu = left('cpu');
  if (!me || !cpu){
    S.over = {winner: !me && !cpu ? S.turn : me ? 'me' : 'cpu', why: 'all'};
  } else {
    S.turn = other(S.turn);
    if (S.turn === S.first) S.round++;
    if (S.round > ROUNDS) S.over = {winner: me > cpu ? 'me' : cpu > me ? 'cpu' : 'draw', why: 'rounds'};
  }
  if (S.over) ev.push({t: 'over', ...S.over});
}

/* ===== CPU ===== */
// 相手の札の縁を16方向ずつ試し、めくれそうな見込みがいちばん高い所を狙う。skill(0〜1)が低いほどぶれる
function cpuPlan(S, skill = 0.75){
  const mine = S.cards.filter(c => c.alive && c.side === S.turn);
  const foes = S.cards.filter(c => c.alive && c.side !== S.turn);
  let best = null;
  for (const T of mine) for (const X of foes) for (let k = 0; k < 16; k++){
    const a = k * Math.PI / 8, rr = X.r + T.r * 0.2;
    const aim = {x: X.x + Math.cos(a) * rr, y: X.y + Math.sin(a) * rr};
    const s = planScore(S, T, aim);
    if (!best || s > best.s) best = {s, id: T.id, aim};
  }
  const spread = 4 + (1 - skill) * 26;
  const g = () => (rand(S) + rand(S) + rand(S) - 1.5) * 2;
  return {id: best.id, aim: {x: best.aim.x + g() * spread, y: best.aim.y + g() * spread},
          power: Math.min(1, 0.45 + 0.5 * skill + rand(S) * 0.25)};
}
function planScore(S, T, aim){
  const L = reach(T, aim), dist = Math.hypot(L.x - T.x, L.y - T.y), sc = scatterOf(dist);
  let v = 0;
  for (const X of S.cards){
    if (X === T || !X.alive) continue;
    const p = flipChance(force(T, L, X, 0.85), X.weight);
    v += X.side === T.side ? -1.3 * p : p * (1 + X.cost * 0.15);
  }
  const margin = Math.min(L.x, W - L.x, L.y, H - L.y);
  if (margin < sc) v -= 1.5 * (1 - margin / sc);   // ぶれて場外に出る心配
  return v - dist * 0.0003;                          // 同じ見込みなら近いほう
}

return {W, H, TEAM, COST_CAP, ROUNDS, MAX_THROW, BEATS, FIRST_CAP, CHEER_POWER, CHEER_WEIGHT, cheerOf,
        rand, stats, draw, bestTeam, newMatch, throwCard, cpuPlan,
        reach, scatterOf, force, flipChance, elemMul};
})();
