const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../load');
const K = loadGame();

const caoCities = G => Object.values(G.cities).filter(c => c.owner === 'cao').map(c => c.id);

// ---------- 작업 1: 연습 판과 보호 ----------
test('튜토리얼 시작 상태', () => {
  const G = K.newTutorial();
  assert.equal(G.year, 191); assert.equal(G.month, 1);
  assert.equal(G.playerFaction, 'cao');
  assert.equal(G.cities.xuchang.owner, null);
  assert.equal(G.tut.step, 1);
  assert.equal(G.tut.protect, true);
});

test('일반 판에는 보호가 없다', () => {
  const G = K.newGame('cao', 1);
  assert.equal(G.tut, null);
  assert.equal(K.isProtected(G, 'xuchang'), false);
  assert.equal(K.isProtected(G, 'chenliu'), false);
});

test('보호 중 24턴: AI는 허창과 조조의 성을 노리지 않는다', () => {
  const G = K.newTutorial();
  for (let t = 0; t < 24; t++) {
    K.endTurn(G);
    const guarded = new Set(['xuchang', ...caoCities(G)]);
    const bad = G.sieges.filter(s => s.att !== 'cao' && guarded.has(s.to));
    assert.equal(bad.length, 0, `${t + 1}턴: ${JSON.stringify(bad.map(s => [s.att, s.to]))}`);
    assert.equal(G.cities.xuchang.owner, null, `${t + 1}턴에 허창 주인이 바뀜`);
  }
});

test('건너뛰면 보호가 풀린다', () => {
  const G = K.newTutorial();
  K.tutSkip(G);
  assert.equal(G.tut.protect, false);
  assert.equal(K.isProtected(G, 'xuchang'), false);
  assert.equal(K.isProtected(G, 'chenliu'), false);
});

test('옛 판(형식 1)은 최신 형식으로 옮겨지고 튜토리얼이 없다', () => {
  const old = JSON.parse(K.save(K.newGame('cao', 2)));
  old.saveVer = 1; delete old.tut;
  const G = K.migrate(old);
  assert.equal(G.saveVer, K.SAVE_VER);
  assert.equal(G.tut, null);
});

// ---------- 작업 2: 단계 표와 판정 ----------
const at = (step) => { const G = K.newTutorial(); G.tut.step = step; return G; };
const caoSiege = G => G.sieges.find(s => s.att === 'cao' && s.to === 'xuchang');
function march(G) {
  const units = K.officersIn(G, 'chenliu').slice(0, 2).map(g => ({ gen: g.id, type: 'inf', troops: 5000 }));
  return K.launchAttack(G, 'chenliu', 'xuchang', units, 'normal');
}

test('단계 표: 11단계, 설계서 순서', () => {
  assert.deepEqual(Array.from(K.TUT_STEPS, s => s.id),
    ['intro', 'hud', 'openCap', 'stats', 'recruit', 'delegate', 'endTurn1', 'march', 'siege', 'assault', 'victory']);
  for (const s of K.TUT_STEPS) { assert.ok(s.say && s.todo, s.id + ' 문구 없음'); }
});

test('단계 조건: 맞는 행동에서만 넘어간다', () => {
  let G = at(1); assert.equal(K.tutCheck(G, { type: 'next' }), true); assert.equal(G.tut.step, 2);
  G = at(3);
  assert.equal(K.tutCheck(G, { type: 'select', city: 'luoyang' }), false);
  assert.equal(K.tutCheck(G, { type: 'next' }), false);
  assert.equal(K.tutCheck(G, { type: 'select', city: 'chenliu' }), true); assert.equal(G.tut.step, 4);
  G = at(5);
  assert.equal(K.tutCheck(G, { type: 'task', gen: 'xiahoudun', task: 'train' }), false);
  assert.equal(K.tutCheck(G, { type: 'task', gen: 'caohong', task: 'recruit' }), false);
  K.setTask(G, 'xiahoudun', 'recruit');
  assert.equal(K.tutCheck(G, { type: 'task', gen: 'xiahoudun', task: 'recruit' }), true); assert.equal(G.tut.step, 6);
  G = at(6); assert.equal(K.tutCheck(G, { type: 'select', city: 'puyang' }), true); assert.equal(G.tut.step, 7);
  G = at(7); assert.equal(K.tutCheck(G, { type: 'next' }), false); assert.equal(K.tutCheck(G, { type: 'turn' }), true); assert.equal(G.tut.step, 8);
});

test('8단계: 허창 포위가 생겨야 넘어간다', () => {
  const G = at(8);
  assert.equal(K.tutCheck(G, { type: 'next' }), false);
  assert.ok(march(G));
  assert.equal(K.tutCheck(G, { type: 'next' }), true);
  assert.equal(G.tut.step, 9);
});

test('9단계: 포위 2턴째가 되면 10단계', () => {
  const G = at(8); march(G); K.tutCheck(G, { type: 'next' });
  K.endTurn(G); K.tutCheck(G, { type: 'turn' });
  assert.equal(G.tut.step, 9);
  K.endTurn(G); K.tutCheck(G, { type: 'turn' });
  assert.equal(caoSiege(G).turns >= 2, true);
  assert.equal(G.tut.step, 10);
});

test('포위가 없어지면 8단계로 돌아간다', () => {
  const G = at(8); march(G); K.tutCheck(G, { type: 'next' });
  G.sieges = G.sieges.filter(s => !(s.att === 'cao' && s.to === 'xuchang'));
  assert.equal(K.tutCheck(G, { type: 'turn' }), true);
  assert.equal(G.tut.step, 8);
});

test('10단계에서 지면 그대로(포위가 남으면) 다시 공격', () => {
  const G = at(8); march(G); G.tut.step = 10;
  assert.equal(K.tutCheck(G, { type: 'battle', city: 'xuchang', won: false }), false);
  assert.equal(G.tut.step, 10);
});

test('함락하면 11단계, 다음을 누르면 끝나고 보호가 풀린다', () => {
  const G = at(10);
  G.cities.xuchang.owner = 'cao';
  assert.equal(K.tutCheck(G, { type: 'battle', city: 'xuchang', won: true }), true);
  assert.equal(G.tut.step, 11);
  assert.equal(K.tutCheck(G, { type: 'next' }), true);
  assert.equal(G.tut.done, true);
  assert.equal(G.tut.protect, false);
});

test('턴 종료는 7·9·10단계에서만', () => {
  for (let s = 1; s <= 11; s++) assert.equal(K.tutCanEndTurn(at(s)), [7, 9, 10].includes(s), '단계 ' + s);
  const G = at(3); K.tutSkip(G); assert.equal(K.tutCanEndTurn(G), true);
  assert.equal(K.tutCanEndTurn(K.newGame('cao', 1)), true);
});

// ---------- 작업 3: 기본 편성과 승률 보장 ----------
function playTo10(G) {
  K.setTask(G, 'xiahoudun', 'recruit');
  K.endTurn(G);
  const units = K.defaultArmy(G, 'chenliu');
  const s = K.launchAttack(G, 'chenliu', 'xuchang', units, 'normal');
  K.endTurn(G); K.endTurn(G);
  return s;
}

test('기본 편성: 장수 3명, 성 병력의 60% 이하, 장수 한도 안', () => {
  const G = K.newTutorial();
  const c = G.cities.chenliu;
  const units = K.defaultArmy(G, 'chenliu');
  assert.equal(units.length, 3);
  const tot = units.reduce((a, u) => a + u.troops, 0);
  assert.ok(tot <= c.troops * 0.6, `${tot} > 60% of ${c.troops}`);
  for (const u of units) {
    assert.ok(u.troops >= 100 && u.troops % 100 === 0);
    assert.ok(u.troops <= K.unitCap(G.gens[u.gen]));
    assert.equal(u.type, K.bestType(G.gens[u.gen]));
  }
});

test('승률 보장: 기본 편성으로 2턴 포위하면 허창 예상 승률 95% 이상', () => {
  const G = K.newTutorial();
  const s = playTo10(G);
  assert.ok(s, '출진 실패');
  assert.ok(G.sieges.includes(s), '포위가 유지되지 않음');
  const p = K.assaultOdds(G, s, 40);
  assert.ok(p >= 0.95, '예상 승률 ' + p);
});

// ---------- 검토 지적 반영 ----------
test('5단계: 하후돈을 미리 징병으로 바꿔 뒀으면 아무 사건에나 넘어간다', () => {
  const G = at(3);
  K.setTask(G, 'xiahoudun', 'recruit');
  K.tutCheck(G, { type: 'task', gen: 'xiahoudun', task: 'recruit' });
  assert.equal(G.tut.step, 3, '3단계에서 미리 바꾼 것은 넘김으로 치지 않음');
  G.tut.step = 5;
  assert.equal(K.tutCheck(G, { type: 'tick' }), true);
  assert.equal(G.tut.step, 6);
});

test('출진은 「다음」이 아니다: 1·2·4단계에서 출진해도 설명이 건너뛰어지지 않고, 8단계에서 바로 넘어간다', () => {
  const G = at(2);
  march(G);
  assert.equal(K.tutCheck(G, { type: 'march' }), false);
  assert.equal(G.tut.step, 2);
  G.tut.step = 8;
  assert.equal(K.tutCheck(G, { type: 'tick' }), true);
  assert.equal(G.tut.step, 9);
});

test('허창을 함락하는 즉시 보호가 풀린다', () => {
  const G = at(10);
  G.cities.xuchang.owner = 'cao';
  K.tutCheck(G, { type: 'turn' });
  assert.equal(G.tut.step, 11);
  assert.equal(G.tut.protect, false);
  assert.equal(G.tut.done, false);
});

test('10단계에서 지면 다시 치라는 표시가 남는다', () => {
  const G = at(8); march(G); G.tut.step = 10;
  K.tutCheck(G, { type: 'battle', city: 'xuchang', won: false });
  assert.equal(G.tut.retry, true);
});

test('5단계: 하후돈이 이미 출진했으면 진류의 다른 장수가 징병해도 넘어간다', () => {
  const G = at(4);
  const units = [{ gen: 'xiahoudun', type: 'inf', troops: 5000 }];
  assert.ok(K.launchAttack(G, 'chenliu', 'xuchang', units, 'normal'));
  G.tut.step = 5;
  assert.equal(K.tutCheck(G, { type: 'tick' }), false);
  assert.equal(K.tutRecruiter(G), 'caocao');
  K.setTask(G, 'caohong', 'recruit');
  assert.equal(K.tutCheck(G, { type: 'tick' }), true);
  assert.equal(G.tut.step, 6);
});
