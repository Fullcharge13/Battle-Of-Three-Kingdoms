const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../load');
const K = loadGame();

const ng = (seed = 7) => K.newGame('cao', seed);
const troopsOf = (G, fid) => Object.values(G.cities).filter(c => c.owner === fid).reduce((a, c) => a + c.troops, 0)
  + (G.convoys || []).filter(v => v.owner === fid).reduce((a, v) => a + v.troops, 0);

// ---------- 작업 2: 병력 수송 ----------
test('수송 경로: 아군 도시만 지나는 최단 경로', () => {
  const G = ng();
  assert.deepEqual(Array.from(K.ownPath(G, 'puyang', 'chenliu')), ['puyang', 'chenliu']);
  G.cities.xuchang.owner = 'cao';
  assert.deepEqual(Array.from(K.ownPath(G, 'puyang', 'xuchang')), ['puyang', 'chenliu', 'xuchang']);
  assert.equal(K.ownPath(G, 'puyang', 'luoyang'), null);
});

test('이웃 도시로 보내면 다음 턴에 도착하고, 출발 때 식량을 낸다', () => {
  const G = ng();
  const from = G.cities.puyang, to = G.cities.chenliu;
  from.troops = 20000;
  const food0 = from.food, to0 = to.troops;
  const v = K.sendTroops(G, 'puyang', 'chenliu', 5000);
  assert.ok(v);
  assert.equal(from.troops, 15000);
  assert.equal(from.food, food0 - 1 * 5000 * 0.02);
  K.tickConvoys(G);
  assert.equal(to.troops, to0 + 5000);
  assert.equal(G.convoys.length, 0);
});

test('두 칸이면 2턴 걸린다', () => {
  const G = ng();
  G.cities.xuchang.owner = 'cao';
  G.cities.puyang.troops = 20000;
  const x0 = G.cities.xuchang.troops;
  K.sendTroops(G, 'puyang', 'xuchang', 5000);
  K.tickConvoys(G);
  assert.equal(G.cities.xuchang.troops, x0);
  assert.equal(G.convoys.length, 1);
  K.tickConvoys(G);
  assert.equal(G.cities.xuchang.troops, x0 + 5000);
});

test('보낼 수 없는 경우: 3000 미만 남음, 500 미만, 포위당함, 경로 없음, 식량 부족', () => {
  const G = ng();
  const c = G.cities.puyang;
  c.troops = 7000;
  assert.equal(K.sendTroops(G, 'puyang', 'chenliu', 4500), null, '3000 미만 남음');
  assert.equal(K.sendTroops(G, 'puyang', 'chenliu', 400), null, '500 미만');
  assert.equal(K.sendTroops(G, 'puyang', 'luoyang', 1000), null, '경로 없음');
  c.food = 10;
  assert.equal(K.sendTroops(G, 'puyang', 'chenliu', 1000), null, '식량 부족');
  c.food = 50000; c.troops = 20000;
  G.sieges.push({ id: 99, att: 'yuan', from: 'ye', to: 'puyang', units: [], turns: 0, defMorale: 100, attMorale: 100 });
  assert.equal(K.sendTroops(G, 'puyang', 'chenliu', 1000), null, '포위당함');
});

test('병력 보존: 가는 길이 끊기면 가까운 아군 도시로 가서 합쳐진다', () => {
  const G = ng();
  G.cities.xuchang.owner = 'cao';
  G.cities.puyang.troops = 20000;
  const total = troopsOf(G, 'cao');
  K.sendTroops(G, 'puyang', 'xuchang', 5000);
  G.cities.xuchang.owner = 'dong';
  const lost = G.cities.xuchang.troops;
  K.tickConvoys(G);
  K.tickConvoys(G);
  assert.equal(G.convoys.length, 0);
  assert.equal(troopsOf(G, 'cao'), total - lost, '병력이 사라지거나 늘어남');
});

test('아군 도시가 하나도 없으면 행렬은 흩어진다', () => {
  const G = ng();
  G.cities.puyang.troops = 20000;
  K.sendTroops(G, 'puyang', 'chenliu', 5000);
  G.cities.puyang.owner = 'yuan'; G.cities.chenliu.owner = 'yuan';
  K.tickConvoys(G);
  assert.equal(G.convoys.length, 0);
});

test('저장·불러오기 뒤 행렬이 그대로, 옛 판(형식 2) 옮기기', () => {
  const G = ng();
  G.cities.puyang.troops = 20000;
  K.sendTroops(G, 'puyang', 'chenliu', 5000);
  const G2 = K.load(K.save(G));
  assert.equal(G2.convoys.length, 1);
  assert.equal(G2.convoys[0].troops, 5000);
  const old = JSON.parse(K.save(ng())); old.saveVer = 2; delete old.convoys; delete old.coalition;
  const G3 = K.migrate(old);
  assert.equal(G3.saveVer, 3);
  assert.deepEqual(Array.from(G3.convoys), []);
  assert.equal(G3.coalition, null);
});

// ---------- 작업 3: AI의 수송·공략 판단 ----------
test('AI 후방 도시는 남는 병력을 전선으로 보낸다', () => {
  const G = K.newGame(null, 5, { observer: true });
  G.cities.beiping.owner = 'yuan'; G.cities.pingyuan.owner = 'yuan';
  G.cities.beiping.troops = 40000;
  for (let i = 0; i < 3; i++) K.endTurn(G);
  assert.ok(G.cities.beiping.troops < 35000, '북평 병력 ' + G.cities.beiping.troops);
});

test('플레이어 위임 도시는 「전선 지원」 방침일 때만 보낸다', () => {
  const G = K.newGame('cao', 5);
  const c = G.cities.puyang;
  c.troops = 60000;
  c.policy = 'dev';
  assert.equal(K.supplyPlan(G, 'puyang'), null);
  c.policy = 'sup';
  const plan = K.supplyPlan(G, 'puyang');
  assert.ok(plan && plan.to === 'chenliu' && plan.n >= 500, JSON.stringify(plan));
  G.cities.chenliu.direct = true; c.direct = true;
  assert.equal(K.supplyPlan(G, 'puyang'), null, '직할 도시는 자동으로 보내지 않음');
});

test('준비 뒤 수비력은 지금 수비력보다 낮다', () => {
  const G = ng();
  assert.ok(K.preparedDefense(G, 'luoyang') < K.defenseOf(G, G.cities.luoyang));
});

test('AI 세력 하나는 동시에 한 곳만 포위한다', () => {
  const G = K.newGame(null, 11, { observer: true });
  for (let t = 0; t < 36; t++) {
    K.endTurn(G);
    const per = {};
    for (const s of G.sieges) per[s.att] = (per[s.att] || 0) + 1;
    for (const f in per) assert.ok(per[f] <= 1, `${t + 1}턴 ${f} 포위 ${per[f]}곳`);
  }
});

test('첫해(191년)에는 공략 기준이 2.2배, 주인 없는 성은 예외', () => {
  const G = ng();
  const base = K.aiAttackBar(G, G.cities.luoyang);
  assert.ok(Math.abs(K.aiAttackBar(G, G.cities.xuchang) * 2.2 - base) < 1e-9);
  G.year = 192;
  assert.ok(Math.abs(K.aiAttackBar(G, G.cities.luoyang) * 2.2 - base) < 1e-9);
});

// ---------- 작업 4: 연합 ----------
const give = (G, fid, ids) => { for (const id of ids) G.cities[id].owner = fid; };
const BIG6 = ['ye', 'nanpi', 'beiping', 'pingyuan', 'luoyang', 'wan'];

test('한 세력이 도시 40%를 넘으면 맞닿은 세력들이 연합한다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  assert.ok(G.coalition, '연합이 안 생김');
  assert.equal(G.coalition.target, 'yuan');
  const m = Array.from(G.coalition.members);
  for (const f of ['cao', 'dong', 'tao', 'liu']) assert.ok(m.includes(f), f + ' 빠짐');
  assert.ok(!m.includes('yuan'));
  assert.ok(G.log.some(l => l.kind === 'big' && l.text.includes('연합')));
});

test('경계 흔들림 없음: 5개(33%)면 유지, 4개 이하면 해산', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  G.cities.wan.owner = 'yuanshu';
  K.updateCoalition(G);
  assert.ok(G.coalition, '5개에서 풀림');
  G.cities.luoyang.owner = 'dong';
  K.updateCoalition(G);
  assert.equal(G.coalition, null, '4개에서도 유지됨');
});

test('연합끼리는 서로 포위하지 않고, 플레이어가 연합 쪽이면 플레이어를 치지 않는다', () => {
  const G = K.newGame('cao', 9);
  give(G, 'yuan', BIG6);
  for (const c of BIG6) G.cities[c].troops = 60000;
  const seen = new Set();
  for (let t = 0; t < 24; t++) {
    K.endTurn(G);
    const fresh = G.sieges.filter(s => !seen.has(s.id));
    fresh.forEach(s => seen.add(s.id));
    if (!G.coalition) continue;
    const m = Array.from(G.coalition.members);
    // 이미 하던 포위는 끝까지 둔다(설계서 4절) — 이번 턴에 새로 시작한 포위만 본다
    for (const s of fresh) {
      if (s.att === 'cao') continue;
      const to = G.cities[s.to].owner;
      assert.ok(!(m.includes(s.att) && m.includes(to)), `${t + 1}턴: 연합 ${s.att}가 연합 ${to}를 포위`);
    }
  }
});

test('플레이어가 연합 세력을 치면 플레이어만 빠지고 다시 못 들어간다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  G.cities.puyang.troops = 40000;
  const ids = K.officersIn(G, 'puyang').slice(0, 1).map(g => g.id);
  assert.ok(K.launchAttack(G, 'puyang', 'xiapi', ids.map(id => ({ gen: id, type: 'inf', troops: 8000 })), 'normal'));
  assert.ok(!Array.from(G.coalition.members).includes('cao'));
  assert.ok(Array.from(G.coalition.left).includes('cao'));
  K.updateCoalition(G);
  assert.ok(!Array.from(G.coalition.members).includes('cao'), '다시 들어감');
});

test('패권 세력을 치는 것은 탈퇴가 아니다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  G.cities.chenliu.troops = 40000;
  const ids = K.officersIn(G, 'chenliu').slice(0, 1).map(g => g.id);
  assert.ok(K.launchAttack(G, 'chenliu', 'luoyang', ids.map(id => ({ gen: id, type: 'inf', troops: 8000 })), 'normal'));
  assert.ok(Array.from(G.coalition.members).includes('cao'));
});

test('튜토리얼 보호 중에는 연합이 생기지 않는다', () => {
  const G = K.newTutorial();
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  assert.equal(G.coalition, null);
});

test('연합의 표적은 연합 AI에게 더 쉬운 목표로 보인다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  assert.equal(K.coalitionBias(G, 'dong', 'yuan'), 1.5);
  assert.equal(K.coalitionBias(G, 'dong', 'liu'), 1);
  assert.equal(K.allied(G, 'dong', 'liu'), true);
  assert.equal(K.allied(G, 'dong', 'yuan'), false);
});

// ---------- 검토 지적 반영 ----------
test('연합 세력이 표적보다 커지면 연합이 그 세력을 새 표적으로 다시 짠다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  assert.equal(G.coalition.target, 'yuan');
  // 원소가 5개로 줄고, 연합원 도겸이 7개가 됨
  G.cities.ye.owner = 'dong';
  for (const c of ['xiapi', 'runan', 'xuchang', 'wan', 'xiangyang', 'changsha', 'changan']) G.cities[c].owner = 'tao';
  K.updateCoalition(G);
  assert.ok(G.coalition, '연합이 사라짐');
  assert.equal(G.coalition.target, 'tao');
  assert.ok(!Array.from(G.coalition.members).includes('tao'));
});

test('플레이어 위임 도시는 연합 세력을 공략하지 않아 플레이어가 저절로 연합에서 빠지지 않는다', () => {
  const G = K.newGame('cao', 3);
  give(G, 'yuan', BIG6);
  K.updateCoalition(G);
  assert.ok(Array.from(G.coalition.members).includes('cao'));
  const p = G.cities.puyang;
  p.policy = 'atk'; p.target = 'xiapi'; p.troops = 80000; G.cities.xiapi.troops = 500; G.cities.xiapi.wall = 0;
  for (let t = 0; t < 3; t++) K.endTurn(G);
  assert.ok(!G.sieges.some(s => s.att === 'cao' && s.to === 'xiapi'), '태수가 연합 세력을 침');
  if (G.coalition) assert.ok(!Array.from(G.coalition.left).includes('cao'));
});

test('길이 끊긴 수송은 되도록 아군 성만 지나 돌아간다', () => {
  const G = ng();
  // 진류 → 복양 → 하비(조조 소유로) 행렬에서 복양을 빼앗김
  G.cities.xiapi.owner = 'cao'; G.cities.chenliu.troops = 30000;
  const v = K.sendTroops(G, 'chenliu', 'xiapi', 6000);
  assert.ok(v);
  K.tickConvoys(G); // 복양 도착
  G.cities.puyang.owner = 'yuan';
  K.tickConvoys(G);
  const left = G.convoys.find(x => x.id === v.id);
  if (left) for (const id of left.path.slice(1, -1)) assert.equal(G.cities[id].owner, 'cao', '적 성을 지나는 길');
});
