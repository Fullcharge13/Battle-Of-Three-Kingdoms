// 밸런스 시뮬레이션: 병종 상성, 피해 비중, 공성 준비 효과, AI끼리 120턴
// 사용: node tests/sim/balance.js [battles=300] [games=12]
const { loadGame } = require('../load');
const K = loadGame();
const N = +process.argv[2] || 300;
const GAMES = +process.argv[3] || 12;
const rng = K.makeRng(2026);
const ri = (lo, hi) => Math.round(lo + (hi - lo) * rng());
const gen = (i) => ({ id: 'g' + i, name: 'g' + i, lead: ri(60, 85), war: ri(60, 85), int: 50, pol: 50, apt: { inf: 'B', arc: 'B', cav: 'B' } });
const army = (types, troops, base) => types.map((t, i) => ({ gen: gen(base + i), type: t, troops, train: 60 }));
const pct = x => (100 * x).toFixed(0) + '%';
const out = {};

// 1) 단일 병종 맞대결
const T = ['inf', 'arc', 'cav'], NAME = { inf: '보병', arc: '궁병', cav: '기병' };
console.log(`\n## 1. 단일 병종 맞대결 (3부대×6000, ${N}판, 행이 공격 측 승률)`);
console.log('| | 보병 | 궁병 | 기병 |\n|---|---|---|---|');
out.matrix = {};
for (const a of T) {
  const row = [];
  for (const d of T) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const r = K.simulateBattle(army([a, a, a], 6000, 0), army([d, d, d], 6000, 10), { siege: false }, K.makeRng(i * 31 + 7), true);
      if (r.winner === 0) w++;
    }
    row.push(w / N); out.matrix[a + '>' + d] = w / N;
  }
  console.log(`| ${NAME[a]} | ${row.map(pct).join(' | ')} |`);
}

// 2) 혼성군 피해 비중
const share = { inf: 0, arc: 0, cav: 0 };
let tot = 0;
for (let i = 0; i < N; i++) {
  const pickT = () => T[Math.floor(rng() * 3)];
  const A = [pickT(), pickT(), pickT(), pickT()], D = [pickT(), pickT(), pickT(), pickT()];
  const r = K.simulateBattle(army(A, 6000, 0), army(D, 6000, 10), { siege: false }, K.makeRng(i * 13 + 1), true);
  for (const side of [0, 1]) for (const t of T) {
    // 병종 수로 나눠 「한 부대당」 비중으로 본다
    const cnt = (side === 0 ? A : D).filter(x => x === t).length;
    if (cnt) { share[t] += r.dmgBy[side][t] / cnt; tot += r.dmgBy[side][t] / cnt; }
  }
}
console.log(`\n## 2. 혼성군 무작위 4부대 대결 ${N}판: 부대 하나당 피해 비중(같으면 33%)`);
for (const t of T) console.log(`- ${NAME[t]}: ${pct(share[t] / tot)}`);
out.share = Object.fromEntries(T.map(t => [t, share[t] / tot]));

// 3) 공성: 준비 여부
function siegeRate(wallRatio, morale) {
  let w = 0, gate = 0, rounds = 0;
  for (let i = 0; i < N; i++) {
    const att = army(['inf', 'inf', 'arc', 'cav'], 10000, 0);
    const def = army(['inf', 'arc', 'arc'], 9000, 10);
    const r = K.simulateBattle(att, def, { siege: true, wall: 3000 * wallRatio, wallMax: 3000, defMorale: morale }, K.makeRng(i * 17 + 3), true);
    if (r.winner === 0) w++;
    if (r.gateBroken) gate++;
    rounds += r.rounds;
  }
  return { win: w / N, gate: gate / N, rounds: rounds / N };
}
console.log(`\n## 3. 공성 (공격 4부대×10000 vs 수비 3부대×9000, 성벽 3000, ${N}판)`);
console.log('| 상황 | 공격 승률 | 성문 돌파 | 평균 라운드 |\n|---|---|---|---|');
const cases = [['준비 없이 바로(내구 100%, 사기 100)', 1, 100], ['포위 1턴(사기 92)', 1, 92], ['포위 2턴(사기 84)', 1, 84], ['포위 2턴 + 공작 1회(내구 85%, 사기 84)', 0.85, 84], ['포위 3턴 + 공작 2회(내구 73%, 사기 76)', 0.73, 76]];
out.siege = {};
for (const [label, wr, m] of cases) {
  const s = siegeRate(wr, m); out.siege[label] = s;
  console.log(`| ${label} | ${pct(s.win)} | ${pct(s.gate)} | ${s.rounds.toFixed(1)} |`);
}

// 4) AI끼리 120턴
console.log(`\n## 4. AI끼리 120턴 × ${GAMES}판 (관전 모드)`);
const games = [];
for (let s = 1; s <= GAMES; s++) {
  const G = K.newGame(null, s * 101, { observer: true });
  let changes = 0, ch24 = 0, first = null, err = null, unified = null, prev = Object.fromEntries(Object.values(G.cities).map(c => [c.id, c.owner]));
  const alive60 = [];
  try {
    for (let t = 1; t <= 120; t++) {
      K.endTurn(G);
      for (const c of Object.values(G.cities)) if (c.owner !== prev[c.id]) { changes++; if (t <= 24) ch24++; if (first == null) first = t; prev[c.id] = c.owner; }
      if (t === 60) alive60.push(Object.values(G.factions).filter(f => f.alive).length);
      if (G.over === 'unified' && unified == null) { unified = t; break; }
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 3).join(' / '); }
  const alive = Object.values(G.factions).filter(f => f.alive);
  const top = alive.map(f => [f.name, K.citiesOf(G, f.id).length]).sort((a, b) => b[1] - a[1])[0];
  const virt = Object.values(G.gens).filter(g => g.virtual).length;
  games.push({ seed: s, changes, ch24, first, alive60: alive60[0], aliveEnd: alive.length, top, unified, err, virt, year: G.year });
}
console.log('| 판 | 주인 바뀜(24턴까지) | 첫 함락 턴 | 60턴 생존 세력 | 끝 생존 | 최대 세력(도시) | 통일 턴 | 가상 인재 | 오류 |\n|---|---|---|---|---|---|---|---|---|');
for (const g of games) console.log(`| ${g.seed} | ${g.changes}(${g.ch24}) | ${g.first ?? '-'} | ${g.alive60 ?? '-'} | ${g.aliveEnd} | ${g.top ? g.top.join(' ') : '-'} | ${g.unified ?? '-'} | ${g.virt} | ${g.err ? 'X ' + g.err : '0'} |`);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`\n중앙값: 주인 바뀜 ${med(games.map(g => g.changes))}회(24턴까지 ${med(games.map(g => g.ch24))}회), 첫 함락 ${med(games.map(g => g.first ?? 999))}턴, 끝 생존 ${med(games.map(g => g.aliveEnd))}세력, 오류 ${games.filter(g => g.err).length}판, 60턴 이내 통일 ${games.filter(g => g.unified && g.unified <= 60).length}판`);
out.games = games;
require('fs').writeFileSync(require('path').join(__dirname, 'last.json'), JSON.stringify(out, null, 1));
