/* 名字バトル — 画面と操作。メンコの決まりは menko.js、名字の仮データは names.js
   URL に ?auto を付けると、自分の側も CPU が投げる(見た目の確認用)。?theme=dark|light で配色を固定 */
(() => {
'use strict';
const M = Menko, D = MYOJI;
const $ = s => document.querySelector(s);
const EL = {木:'wood', 火:'fire', 土:'earth', 金:'metal', 水:'water', 無:'none'};
const SIZE = ['', '小', '中', '大', '特大'];
const GAIN = 3;           // 指で引いた長さ → 投げる距離の倍率
const GAUGE_MS = 1300;    // 勢いのゲージが1往復する時間
const PEAK = 0.92;        // ここから上は「会心」
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

const gacha = {seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0};
const ui = {pref: null, hand: [], pick: [], team: null, foePref: null, S: null,
            pos: {}, tw: [], ring: null, drag: null, busy: false, scale: 1};

/* ===== 共通 ===== */
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const lerp = (a, b, k) => a + (b - a) * k;
const popText = n => n >= 1e5 ? `約${Math.round(n / 1e4)}万人` : n >= 1e4 ? `約${(n / 1e4).toFixed(1)}万人` : `約${Math.round(n / 1e3) * 1000}人`;
const elemText = e => e === '無' ? '無属性' : e + '属性';
const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
const gauge = ms => 0.5 - 0.5 * Math.cos(2 * Math.PI * ms / GAUGE_MS);
function show(id){
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  $('#result').hidden = true;
  if (id === 'battle') fit();
  window.scrollTo(0, 0);
}

/* ===== はじめ: 土地を選ぶ ===== */
function renderHome(){
  $('#prefs').innerHTML = D.PREFS.map(p => {
    const top = Object.entries(p.w).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join('・');
    return `<button class="pref" data-pref="${p.id}"><b>${esc(p.name)}</b><span>${esc(top)}…</span></button>`;
  }).join('');
}

/* ===== 引いた札から3枚選ぶ ===== */
function startDraw(id){ ui.pref = D.PREFS.find(p => p.id === id); redraw(); show('draw'); }
function redraw(){ ui.hand = M.draw(ui.pref, 5, gacha, D); ui.pick = []; renderDraw(); }
function renderDraw(){
  const cost = ui.pick.reduce((s, i) => s + ui.hand[i].cost, 0);
  const cheapest = ui.hand.map(c => c.cost).sort((a, b) => a - b).slice(0, M.TEAM).reduce((s, x) => s + x, 0);
  $('#drawTitle').textContent = `${ui.pref.name}で5枚引きました`;
  $('#drawNote').textContent = cheapest > M.COST_CAP
    ? `コストの合計が${M.COST_CAP}に収まる組み合わせがありません。引き直してください。`
    : `3枚選んでチームを作ります。珍しい名字ほど威力が高く、コストも重くなります。`;
  $('#hand').innerHTML = ui.hand.map((c, i) => tile(c, i, ui.pick.includes(i))).join('');
  const cheer = ui.pick.length === M.TEAM && cost <= M.COST_CAP ? M.COST_CAP - cost : 0;
  $('#cost').innerHTML = `選んだ札 <b class="num">${ui.pick.length}</b>/${M.TEAM} ・ コスト <b class="num${cost > M.COST_CAP ? ' over' : ''}">${cost}</b>/${M.COST_CAP}`
    + (cheer ? ` ・ 応援 <b class="num">${cheer}</b>(3枚とも威力+${fmt(cheer * M.CHEER_POWER)}・重さ+${fmt(cheer * M.CHEER_WEIGHT)})` : '');
  $('#go').disabled = !(ui.pick.length === M.TEAM && cost <= M.COST_CAP);
}
function tile(c, i, on){
  const bar = (v, max) => `<i style="--v:${Math.round(Math.min(1, v / max) * 100)}%"></i>`;
  return `<button class="tile e-${EL[c.elem]}" data-pick="${i}" aria-pressed="${on}">
    <span class="tel">${c.elem}</span>
    <span class="tname">${esc(c.name)}</span><span class="tread">${esc(c.reading)}</span>
    <span class="trow"><span>威力</span>${bar(c.power, 62)}<b>${c.power}</b></span>
    <span class="trow"><span>重さ</span>${bar(c.weight, 34)}<b>${c.weight}</b></span>
    <span class="trow"><span>大きさ</span><em>${SIZE[Math.min(c.len, 4)]}</em></span>
    <span class="tfoot"><span class="tcost" aria-label="コスト${c.cost}">${'●'.repeat(c.cost)}${'○'.repeat(5 - c.cost)}</span><span>全国${popText(c.pop)}</span></span>
  </button>`;
}
function togglePick(i){
  const k = ui.pick.indexOf(i);
  if (k >= 0) ui.pick.splice(k, 1);
  else if (ui.pick.length < M.TEAM) ui.pick.push(i);
  renderDraw();
}

/* ===== 対戦 ===== */
function startBattle(team){
  ui.team = team;
  let foe;
  do {
    ui.foePref = D.PREFS[Math.floor(M.rand(gacha) * D.PREFS.length)];
    foe = M.bestTeam(M.draw(ui.foePref, 5, gacha, D));
  } while (!foe);
  ui.S = M.newMatch(team, foe, Math.floor(M.rand(gacha) * 2 ** 32));
  ui.tw = []; ui.ring = null; ui.drag = null;
  syncPos();
  show('battle');
  $('#log').textContent = ui.S.first === 'me' ? 'あなたが先に投げます。' : '相手が先に投げます。';
  nextTurn();
}
function syncPos(){
  ui.pos = {};
  for (const c of ui.S.cards) ui.pos[c.id] = {x: c.x, y: c.y, lift: 0, flip: 0, alpha: c.alive ? 1 : 0};
}
function nextTurn(){
  const S = ui.S;
  hud();
  if (S.over) return finish();
  const firstNote = S.throws === 0 ? `(試合の1投目は勢いが${M.FIRST_CAP * 10}割まで)` : '';
  if (S.turn === 'cpu' || AUTO){
    ui.busy = true;
    $('#msg').textContent = S.turn === 'cpu' ? '相手が狙っています…' : '(自動で投げます)';
    setTimeout(() => { const p = M.cpuPlan(S, 0.75); doThrow(p.id, p.aim, p.power); }, 750);
  } else {
    ui.busy = false;
    $('#msg').textContent = `あなたの番。自分の札を指で後ろへ引き、ゲージが満ちたところで離す。${firstNote}`;
  }
}
function doThrow(id, aim, power){
  ui.busy = true; ui.drag = null; setGauge(0);
  const S = ui.S, T = S.cards.find(c => c.id === id);
  const capped = S.throws === 0;
  const ev = M.throwCard(S, id, aim, power);
  if (!ev){ ui.busy = false; return; }
  play(ev, () => {
    syncPos();
    $('#log').textContent = describe(ev, T, capped);
    hud();
    setTimeout(nextTurn, 600);
  });
}
// 起きたことを一文にする
function describe(ev, T, capped){
  const name = id => ui.S.cards.find(c => c.id === id);
  const flips = ev.filter(e => e.t === 'flip').map(e => name(e.id));
  const outs = ev.filter(e => e.t === 'out' && !e.self).map(e => name(e.id));
  const own = [...flips, ...outs].filter(c => c.side === T.side).map(c => c.name);
  const fly = ev[0];
  let s = `${T.side === 'me' ? 'あなた' : '相手'}の${T.name}`;
  s += !capped && fly.power >= PEAK ? '、会心の一撃! ' : ' → ';
  const parts = [];
  if (flips.some(c => c.side !== T.side)) parts.push(`${flips.filter(c => c.side !== T.side).map(c => c.name).join('・')}をめくった`);
  if (outs.some(c => c.side !== T.side)) parts.push(`${outs.filter(c => c.side !== T.side).map(c => c.name).join('・')}を場外へ`);
  if (own.length) parts.push(`味方の${own.join('・')}まで巻きこんだ`);
  if (ev.some(e => e.t === 'out' && e.self)) parts.push('場外へ飛び出した');
  if (!parts.length) parts.push('めくれなかった');
  return s + parts.join('、');
}
function hud(){
  const S = ui.S;
  const left = side => S.cards.filter(c => c.alive && c.side === side).length;
  const dots = k => '●'.repeat(k) + '○'.repeat(M.TEAM - k);
  $('#foe').innerHTML = `<span class="${S.turn === 'cpu' && !S.over ? 'turn' : ''}">相手(${esc(ui.foePref.name)})</span> <span class="dots">${dots(left('cpu'))}</span>`;
  $('#mine').innerHTML = `<span class="${S.turn === 'me' && !S.over ? 'turn' : ''}">あなた(${esc(ui.pref.name)})</span> <span class="dots">${dots(left('me'))}</span>`;
  $('#round').textContent = `第${Math.min(S.round, M.ROUNDS)}回 / ${M.ROUNDS}`;
}
function finish(){
  const o = ui.S.over;
  $('#resTitle').textContent = o.winner === 'me' ? '勝ち!' : o.winner === 'cpu' ? '負け…' : '引き分け';
  $('#resText').textContent = o.why === 'all'
    ? (o.winner === 'me' ? '相手の札をすべてめくりました。' : 'あなたの札がすべてなくなりました。')
    : `${M.ROUNDS}回が終わり、残った札の数で決まりました。`;
  setTimeout(() => { $('#result').hidden = false; }, 400);
}
function cardInfo(c){
  $('#msg').textContent = `${c.name}(${c.reading})・${elemText(c.elem)}・威力${fmt(c.power)} 重さ${fmt(c.weight)} 大きさ${SIZE[Math.min(c.len, 4)]}`
    + (c.cheer ? `(応援${c.cheer}込み)` : '') + `・全国${popText(c.pop)}`;
}

/* ===== 動き(出来事の列を、時間差の小さな動きにして流す) ===== */
function tween(delay, dur, f, init){ ui.tw.push({s: performance.now() + delay, d: dur, f, init, on: false}); }
function play(ev, done){
  const FLY = 460;
  const fly = ev[0];
  tween(0, FLY, k => {
    const p = ui.pos[fly.id], e = 1 - (1 - k) ** 2;
    p.x = lerp(fly.from.x, fly.to.x, e); p.y = lerp(fly.from.y, fly.to.y, e);
    p.lift = Math.sin(Math.PI * k) * (0.5 + 0.5 * fly.power);
  });
  let end = FLY + 300;
  for (const e of ev){
    if (e.t === 'hit') tween(FLY, 420, k => { ui.ring = k < 1 ? {x: e.x, y: e.y, k, power: e.power} : null; },
                             () => { if (navigator.vibrate) navigator.vibrate(25); });
    if (e.t === 'flip'){
      tween(FLY + 40, 480, k => { ui.pos[e.id].flip = k; });
      tween(FLY + 1000, 300, k => { ui.pos[e.id].alpha = 1 - k; });
      end = Math.max(end, FLY + 1300);
    }
    if (e.t === 'out'){
      const id = e.id;
      if (e.self) tween(FLY, 380, k => { ui.pos[id].alpha = 1 - k; });
      else tween(FLY, 340, (k, st) => { const p = ui.pos[id]; p.x = lerp(st.x, e.x, k); p.y = lerp(st.y, e.y, k); p.alpha = 1 - k; },
                 () => ({x: ui.pos[id].x, y: ui.pos[id].y}));
      end = Math.max(end, FLY + 400);
    }
    if (e.t === 'settle') for (const q of e.pos){
      tween(FLY + 30, 280, (k, st) => { const p = ui.pos[q.id], m = 1 - (1 - k) ** 3; p.x = lerp(st.x, q.x, m); p.y = lerp(st.y, q.y, m); },
            () => ({x: ui.pos[q.id].x, y: ui.pos[q.id].y}));
    }
  }
  setTimeout(done, end);
}
function step(now){
  for (const t of ui.tw){
    if (now < t.s) continue;
    if (!t.on){ t.on = true; t.st = t.init ? t.init() : null; }
    const k = t.d ? Math.min(1, (now - t.s) / t.d) : 1;
    t.f(k, t.st);
    if (k >= 1) t.done = true;
  }
  ui.tw = ui.tw.filter(t => !t.done);
}

/* ===== 描画 ===== */
const cv = $('#cv'), ctx = cv.getContext('2d');
let C = {};
function readColors(){
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue('--' + n).trim();
  C = {mat: g('mat'), matLine: g('mat-line'), me: g('card-me'), cpu: g('card-cpu'), ink: g('card-ink'),
       back: g('card-back'), backLine: g('card-back-line'), shadow: g('shadow'), aim: g('aim'), accent: g('accent'), good: g('good'),
       e: {木: g('e-wood'), 火: g('e-fire'), 土: g('e-earth'), 金: g('e-metal'), 水: g('e-water'), 無: g('e-none')}};
}
function fit(){
  const box = $('.field'), w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  const s = Math.min(w / M.W, h / M.H), dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.style.width = Math.floor(M.W * s) + 'px';
  cv.style.height = Math.floor(M.H * s) + 'px';
  cv.width = Math.round(M.W * s * dpr);
  cv.height = Math.round(M.H * s * dpr);
  ui.scale = cv.width / M.W;
}
function frame(now){
  requestAnimationFrame(frame);
  if (!ui.S || $('#battle').hidden) return;
  step(now);
  if (ui.drag){ const g = gauge(now - ui.drag.t0); ui.drag.g = g; setGauge(g); }
  render(now);
}
function setGauge(g){
  $('#gfill').style.width = Math.round(g * 100) + '%';
  $('.gauge').classList.toggle('peak', g >= PEAK);
}
function aimInfo(){
  const dr = ui.drag, T = ui.S.cards.find(c => c.id === dr.id);
  const pull = {x: dr.start.x - dr.cur.x, y: dr.start.y - dr.cur.y};
  const aim = {x: T.x + pull.x * GAIN, y: T.y + pull.y * GAIN};
  const L = M.reach(T, aim);
  return {T, aim, L, sc: M.scatterOf(Math.hypot(L.x - T.x, L.y - T.y)), pulled: Math.hypot(pull.x, pull.y) > 10};
}
function render(now){
  const c = ctx, S = ui.S;
  c.setTransform(ui.scale, 0, 0, ui.scale, 0, 0);
  // 場
  c.fillStyle = C.mat; c.fillRect(0, 0, M.W, M.H);
  c.strokeStyle = C.matLine; c.lineWidth = 2;
  c.strokeRect(4, 4, M.W - 8, M.H - 8);
  c.setLineDash([6, 8]); c.beginPath(); c.moveTo(14, M.H / 2); c.lineTo(M.W - 14, M.H / 2); c.stroke(); c.setLineDash([]);

  const a = ui.drag && aimInfo();
  // 狙っている間は、相手の札の縁(めくりやすい所)を示す
  if (a && a.pulled){
    c.save(); c.strokeStyle = C.accent; c.globalAlpha = 0.55; c.lineWidth = 2; c.setLineDash([4, 5]);
    for (const X of S.cards) if (X.alive && X.side !== 'me'){ c.beginPath(); c.arc(X.x, X.y, X.r, 0, Math.PI * 2); c.stroke(); }
    c.restore();
  }
  // 札(宙にある札を最後に描く)
  const order = S.cards.slice().sort((p, q) => ui.pos[p.id].lift - ui.pos[q.id].lift);
  const myTurn = S.turn === 'me' && !ui.busy && !S.over && !AUTO;
  for (const card of order) drawCard(card, ui.pos[card.id], myTurn && card.alive && card.side === 'me' && !ui.drag, now);
  // 衝撃の輪
  if (ui.ring){
    const r = ui.ring;
    c.save(); c.globalAlpha = 1 - r.k; c.strokeStyle = C.aim; c.lineWidth = 3;
    c.beginPath(); c.arc(r.x, r.y, 20 + r.k * (40 + 50 * r.power), 0, Math.PI * 2); c.stroke(); c.restore();
  }
  // 狙いの線・着地の目安・勢い
  if (a){
    const {T, L, sc} = a, p = ui.pos[T.id];
    c.save();
    c.strokeStyle = ui.drag.g >= PEAK ? C.accent : C.aim; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.arc(p.x, p.y, T.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ui.drag.g); c.stroke();
    if (a.pulled){
      c.strokeStyle = C.aim; c.globalAlpha = 0.7; c.lineWidth = 2; c.setLineDash([2, 6]);
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(L.x, L.y); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 0.9; c.beginPath(); c.arc(L.x, L.y, Math.max(sc, 6), 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(L.x - 6, L.y); c.lineTo(L.x + 6, L.y); c.moveTo(L.x, L.y - 6); c.lineTo(L.x, L.y + 6); c.stroke();
    }
    c.restore();
  }
}
function drawCard(card, p, ready, now){
  if (!p || p.alpha <= 0) return;
  const c = ctx, r = card.r * (1 + 0.35 * p.lift);
  c.save();
  c.globalAlpha = p.alpha;
  c.translate(p.x, p.y);
  // 影(浮くほど離れる)
  c.fillStyle = C.shadow;
  c.beginPath(); c.arc(3 + 12 * p.lift, 4 + 16 * p.lift, r, 0, Math.PI * 2); c.fill();
  // 投げる札の候補は、ゆっくり光らせる
  if (ready){
    c.save(); c.strokeStyle = C.accent; c.lineWidth = 3; c.globalAlpha = 0.35 + 0.35 * Math.sin(now / 300);
    c.beginPath(); c.arc(0, 0, r + 5, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  // めくれる動き: 縦につぶれて裏返る
  const sy = Math.max(0.05, Math.abs(Math.cos(Math.PI * p.flip))), back = p.flip > 0.5;
  c.scale(1, sy);
  c.fillStyle = back ? C.back : card.side === 'me' ? C.me : C.cpu;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.lineWidth = 5; c.strokeStyle = back ? C.backLine : C.e[card.elem];
  c.beginPath(); c.arc(0, 0, r - 2.5, 0, Math.PI * 2); c.stroke();
  if (back){
    c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.stroke();
  } else {
    const k = 1 + 0.35 * p.lift, fs = [0, 24, 19, 16, 13][Math.min(card.len, 4)] * k;
    c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${fs}px "Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif`;
    c.fillText(card.name, 0, 3 * k);
    c.font = `700 ${10 * k}px "Zen Kaku Gothic New",system-ui,sans-serif`;
    c.fillStyle = C.e[card.elem];
    c.fillText(card.elem, 0, -r + 13 * k);
    // 自分の札は下に小さな印
    if (card.side === 'me'){ c.fillStyle = C.accent; c.beginPath(); c.arc(0, r - 11 * k, 2.5 * k, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}

/* ===== 入力 ===== */
function toField(e){
  const b = cv.getBoundingClientRect();
  return {x: (e.clientX - b.left) * M.W / b.width, y: (e.clientY - b.top) * M.H / b.height};
}
cv.addEventListener('pointerdown', e => {
  if (!ui.S) return;
  const p = toField(e);
  const hit = ui.S.cards.filter(c => c.alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
                        .find(c => Math.hypot(c.x - p.x, c.y - p.y) <= c.r + 10);
  if (hit && hit.side === 'me' && ui.S.turn === 'me' && !ui.busy && !ui.S.over && !AUTO){
    ui.drag = {id: hit.id, start: p, cur: p, t0: performance.now(), pid: e.pointerId, g: 0};
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else if (hit) cardInfo(hit);
});
cv.addEventListener('pointermove', e => { if (ui.drag && e.pointerId === ui.drag.pid) ui.drag.cur = toField(e); });
cv.addEventListener('pointerup', e => {
  const dr = ui.drag;
  if (!dr || e.pointerId !== dr.pid) return;
  dr.cur = toField(e);
  const a = aimInfo();
  if (!a.pulled){ ui.drag = null; setGauge(0); cardInfo(a.T); return; }   // 引かずに離したら、札の説明だけ
  doThrow(dr.id, a.aim, gauge(performance.now() - dr.t0));
});
cv.addEventListener('pointercancel', () => { ui.drag = null; setGauge(0); });

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pref) return startDraw(b.dataset.pref);
  if (b.dataset.pick) return togglePick(+b.dataset.pick);
  if (b.dataset.go === 'home') return show('home');
  if (b.id === 'redraw') return redraw();
  if (b.id === 'go') return startBattle(ui.pick.map(i => ui.hand[i]));
  if (b.id === 'again') return startBattle(ui.team);
  if (b.id === 'redo'){ redraw(); return show('draw'); }
});

/* ===== 始める ===== */
readColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
window.addEventListener('resize', fit);
renderHome();
requestAnimationFrame(frame);
if (AUTO){
  ui.pref = D.PREFS.find(p => p.id === (params.get('pref') || 'okinawa'));
  let t; do t = M.bestTeam(M.draw(ui.pref, 5, gacha, D)); while (!t);
  startBattle(t);
}
})();
