const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../load');
const K = loadGame();

const ng = (f = 'cao', seed = 7, opts) => K.newGame(f, seed, opts);
const cityOf = (G, name) => Object.values(G.cities).find(c => c.name === name);
const genOf = (G, name) => Object.values(G.gens).find(g => g.name === name);
const mkUnit = (gen, type, troops) => ({ gen, type, troops });
const gen = (o = {}) => Object.assign({ id: 'x' + Math.random(), name: '가', lead: 70, war: 70, int: 50, pol: 50, apt: { inf: 'B', arc: 'B', cav: 'B' } }, o);

test('데이터 표: 도시 15개, 인접은 서로 연결, 세력 군주가 존재', () => {
  const { CITIES, FACTIONS, GENERALS } = K.DATA;
  assert.equal(CITIES.length, 15);
  const byId = Object.fromEntries(CITIES.map(c => [c.id, c]));
  for (const c of CITIES) for (const n of c.adj) assert.ok(byId[n].adj.includes(c.id), `${c.id}-${n} 단방향`);
  for (const f of FACTIONS) assert.ok(GENERALS.find(g => g.id === f.ruler), f.id + ' 군주 없음');
  assert.ok(GENERALS.length >= 45);
});

test('새 게임: 191년 1월, 플레이어 세력 지정, 수도는 직할', () => {
  const G = ng();
  assert.equal(G.year, 191); assert.equal(G.month, 1);
  assert.equal(G.playerFaction, 'cao');
  const cap = G.cities[G.factions.cao.capital];
  assert.equal(cap.owner, 'cao'); assert.equal(cap.direct, true);
});

test('징병: 인구에 비례해 뽑히고, 인구와 민심이 줄어든다', () => {
  const G = ng();
  const c = G.cities[G.factions.cao.capital];
  const amt = K.recruitAmount(c, { lead: 80, pol: 60 });
  assert.ok(amt >= 2500, '징병량이 너무 적음 ' + amt);
  const pop0 = c.pop, loy0 = c.loyalty, tr0 = c.troops;
  c.gold = 99999;
  K.doRecruit(G, c, { lead: 80, pol: 60 });
  assert.equal(c.troops - tr0, amt);
  assert.ok(c.pop < pop0);
  assert.equal(c.loyalty, loy0 - 3);
});

test('부상병: 이긴 쪽은 잃은 병력의 40%, 진 쪽은 20%가 부상병, 매 턴 25%씩 복귀', () => {
  assert.equal(K.woundedFrom(1000, true), 400);
  assert.equal(K.woundedFrom(1000, false), 200);
  const c = { wounded: 1000, troops: 0 };
  K.healWounded(c);
  assert.equal(c.troops, 250); assert.equal(c.wounded, 750);
});

test('수성 시설 수는 성 내구도 1000마다 1개, 최대 4개', () => {
  assert.equal(K.towersFor(999), 0);
  assert.equal(K.towersFor(2500), 2);
  assert.equal(K.towersFor(9000), 4);
});

test('전투 결정성: 같은 seed면 같은 결과', () => {
  const a = [mkUnit(gen({ id: 'a1' }), 'inf', 5000), mkUnit(gen({ id: 'a2' }), 'arc', 4000)];
  const d = [mkUnit(gen({ id: 'd1' }), 'cav', 5000), mkUnit(gen({ id: 'd2' }), 'inf', 4000)];
  const r1 = K.simulateBattle(a, d, { siege: false }, K.makeRng(5));
  const r2 = K.simulateBattle(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(d)), { siege: false }, K.makeRng(5));
  assert.equal(r1.winner, r2.winner);
  assert.deepEqual(r1.losses, r2.losses);
  assert.ok(r1.frames.length > 0);
});

test('총대장 부대가 무너져도 즉시 패배가 아니라 남은 부대 사기 −30', () => {
  const st = K.battleState(
    [mkUnit(gen({ id: 'a1' }), 'inf', 3000), mkUnit(gen({ id: 'a2' }), 'inf', 6000)],
    [mkUnit(gen({ id: 'd1' }), 'inf', 6000)], { siege: false });
  const other = st.units.find(u => u.side === 0 && u.gen.id === 'a2');
  const m0 = other.morale;
  const cmd = st.units.find(u => u.side === 0 && u.commander);
  K.routUnit(st, cmd);
  assert.equal(st.over, false);
  assert.equal(other.morale, m0 - 30);
});

test('기병은 성벽에 오르지 못한다(사다리 불가)', () => {
  assert.equal(K.canClimb('cav'), false);
  assert.equal(K.canClimb('inf'), true);
  assert.equal(K.canClimb('arc'), true);
});

test('상성: 기병은 궁병에 강하고, 보병은 기병에 강하다', () => {
  assert.ok(K.counter('cav', 'arc') > 1.2);
  assert.ok(K.counter('inf', 'cav') > 1.1);
  assert.ok(K.counter('arc', 'inf') <= 1);
});

test('포위: 포위당한 도시는 턴마다 식량과 사기가 줄어든다', () => {
  const G = ng();
  const from = G.cities[G.factions.cao.capital];
  const target = G.cities[from.adj.find(id => G.cities[id].owner !== 'cao')];
  from.troops = 30000;
  const ids = Object.values(G.gens).filter(g => g.faction === 'cao' && g.city === from.id).slice(0, 2).map(g => g.id);
  const units = ids.map(id => ({ gen: id, type: 'inf', troops: 8000 }));
  const s = K.launchAttack(G, from.id, target.id, units, 'normal');
  assert.ok(s, '포위 생성 실패');
  const food0 = target.food, mor0 = s.defMorale;
  K.tickSieges(G);
  assert.ok(target.food < food0);
  assert.ok(s.defMorale < mor0);
});

test('예상 승률: 0~1 사이이고, 성벽을 깎으면 오르거나 같다', () => {
  const G = ng();
  const from = G.cities[G.factions.cao.capital];
  const target = G.cities['luoyang'];
  from.troops = 60000;
  const ids = Object.values(G.gens).filter(g => g.faction === 'cao' && g.city === from.id).slice(0, 4).map(g => g.id);
  const s = K.launchAttack(G, from.id, target.id, ids.map(id => ({ gen: id, type: 'inf', troops: 12000 })), 'normal');
  const p1 = K.assaultOdds(G, s, 16);
  assert.ok(p1 >= 0 && p1 <= 1);
  target.wall = 0;
  const p2 = K.assaultOdds(G, s, 16);
  assert.ok(p2 >= p1, `${p1} -> ${p2}`);
});

test('전투 기록(관전용)의 수비 세력은 함락 전 주인이다', () => {
  const G = ng('cao', 21);
  const from = G.cities.chenliu, to = G.cities.luoyang;
  from.troops = 80000; to.troops = 1500; to.wall = 0;
  const ids = Object.values(G.gens).filter(g => g.faction === 'cao' && g.city === 'chenliu').slice(0, 4).map(g => g.id);
  const s = K.launchAttack(G, 'chenliu', 'luoyang', ids.map(id => ({ gen: id, type: 'inf', troops: 15000 })), 'normal');
  s.fresh = false;
  K.siegeOrder(G, s.id, 'assault');
  K.endTurn(G);
  const rp = G.replays.find(r => r.title.includes('낙양'));
  assert.ok(rp, '전투 기록 없음');
  assert.equal(G.cities.luoyang.owner, 'cao');
  assert.equal(rp.def, 'dong');
});

test('파괴공작: 포위 중인 도시의 성 내구도를 깎는다', () => {
  const G = ng();
  const c = G.cities[Object.keys(G.cities).find(id => G.cities[id].owner !== 'cao')];
  const w0 = c.wall;
  const res = K.sabotage(G, { int: 95 }, c, K.makeRng(1), true);
  assert.ok(res.ok);
  assert.ok(c.wall < w0);
});

test('위임 AI와 적 AI는 같은 planCity를 쓴다', () => {
  const G = ng();
  const mine = Object.values(G.cities).find(c => c.owner === 'cao' && !c.direct);
  const theirs = Object.values(G.cities).find(c => c.owner && c.owner !== 'cao');
  const calls = [];
  const orig = K.planCity;
  K._hooks.planCity = (G2, id) => { calls.push(id); return orig(G2, id); };
  K.endTurn(G);
  K._hooks.planCity = null;
  if (mine) assert.ok(calls.includes(mine.id), '내 위임 도시가 planCity를 안 탐');
  assert.ok(calls.includes(theirs.id), '적 도시가 planCity를 안 탐');
});

test('나이와 사망: 사망년이 지나면 1월에 죽는다', () => {
  const G = ng();
  const g = Object.values(G.gens).find(x => x.faction === 'cao' && G.factions.cao.ruler !== x.id);
  g.death = 191;
  G.month = 12;
  K.endTurn(G);
  assert.equal(G.year, 192);
  assert.equal(g.alive, false);
});

test('2세는 등장년이 되면 부모 세력에 나타난다', () => {
  const G = ng();
  const pi = genOf(G, '조비');
  assert.ok(pi, '조비 데이터 필요');
  assert.equal(pi.alive, false);
  G.year = pi.appear - 1; G.month = 12;
  K.endTurn(G);
  assert.equal(pi.alive, true);
  assert.equal(pi.faction, 'cao');
});

test('가상 인재: 켜면 장수가 모자란 지역에 재야로 생기고, 끄면 생기지 않는다', () => {
  const run = (on) => {
    const G = ng('cao', 3, { virtual: on });
    for (const g of Object.values(G.gens)) if (g.faction !== G.factions[g.faction]?.ruler) { }
    let n = 0;
    for (let y = 0; y < 6; y++) { K.yearlyTalent(G, K.makeRng(100 + y)); }
    n = Object.values(G.gens).filter(g => g.virtual).length;
    return n;
  };
  assert.ok(run(true) > 0);
  assert.equal(run(false), 0);
});

test('가상 인재는 출신 지역 경향을 따른다(서량 = 기병 적성 높음)', () => {
  const rng = K.makeRng(9);
  let good = 0;
  for (let i = 0; i < 40; i++) { const g = K.makeVirtual('xiliang', 'wuwei', rng, 191); if ('SA'.includes(g.apt.cav)) good++; }
  assert.ok(good >= 24, '서량 기병 적성 S/A 비율이 낮음 ' + good);
});

test('저장·불러오기와 옛 판 옮기기', () => {
  const G = ng();
  K.endTurn(G);
  const s = K.save(G);
  const G2 = K.load(s);
  assert.equal(G2.month, G.month);
  const old = JSON.parse(s); delete old.saveVer; delete old.opts;
  const G3 = K.migrate(old);
  assert.equal(G3.saveVer, K.SAVE_VER);
  assert.equal(G3.opts.virtual, true);
});

test('관전 모드: 플레이어 세력 없이 AI끼리 진행된다', () => {
  const G = K.newGame(null, 5, { observer: true });
  assert.equal(G.playerFaction, null);
  for (let i = 0; i < 24; i++) K.endTurn(G);
  assert.notEqual(G.over, 'lose');
  assert.ok(Object.values(G.cities).every(c => !c.direct));
});

test('30턴을 돌려도 오류가 없고 수치가 깨지지 않는다', () => {
  const G = ng('cao', 11);
  for (let i = 0; i < 30; i++) K.endTurn(G);
  for (const c of Object.values(G.cities)) {
    for (const k of ['pop', 'gold', 'food', 'troops', 'wounded', 'wall', 'loyalty']) {
      assert.ok(Number.isFinite(c[k]) && c[k] >= 0, `${c.name}.${k}=${c[k]}`);
    }
    assert.ok(c.loyalty <= 100);
  }
});
