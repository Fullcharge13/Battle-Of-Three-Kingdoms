// 튜토리얼 자동 완주: 안내대로만 행동하는 가상 플레이어를 n번 돌린다.
// 판 번호(TUT_SEED)는 고정, 판마다 난수 흐름만 바꾼다. 사용: node tests/sim/tutorial_run.js [n=100]
const { loadGame } = require('../load');
const K = loadGame();
const N = +process.argv[2] || 100;

function playOnce(i) {
  const G = K.newTutorial();
  G.rs = (G.rs + i * 2654435761) >>> 0;
  const id = () => K.TUT_STEPS[G.tut.step - 1].id;
  const endTurn = () => {
    if (!K.tutCanEndTurn(G)) throw new Error('턴 종료가 잠긴 단계에서 누름: ' + id());
    K.endTurn(G);
    for (const r of G.replays) K.tutCheck(G, { type: 'battle', city: 'xuchang', won: G.cities.xuchang.owner === 'cao' });
    K.tutCheck(G, { type: 'turn' });
  };
  let guard = 0, assaults = 0;
  while (!G.tut.done && guard++ < 80) {
    switch (id()) {
      case 'intro': case 'hud': case 'stats': case 'victory': K.tutCheck(G, { type: 'next' }); break;
      case 'openCap': K.tutCheck(G, { type: 'select', city: 'chenliu' }); break;
      case 'recruit': K.setTask(G, 'xiahoudun', 'recruit'); K.tutCheck(G, { type: 'task', gen: 'xiahoudun', task: 'recruit' }); break;
      case 'delegate': K.tutCheck(G, { type: 'select', city: 'puyang' }); break;
      case 'endTurn1': case 'siege': endTurn(); break;
      case 'march': {
        const s = K.launchAttack(G, 'chenliu', 'xuchang', K.defaultArmy(G, 'chenliu'), 'normal');
        if (!s) throw new Error('출진 실패');
        K.tutCheck(G, { type: 'next' });
        break;
      }
      case 'assault': {
        const s = G.sieges.find(x => x.att === 'cao' && x.to === 'xuchang');
        const odds = K.assaultOdds(G, s, 12);
        K.siegeOrder(G, s.id, odds >= 0.9 ? 'assault' : 'sabotage');
        if (odds >= 0.9) assaults++;
        endTurn();
        break;
      }
    }
  }
  return { ok: G.tut.done && G.cities.xuchang.owner === 'cao', turns: G.turn, assaults, step: id() };
}

const res = [];
for (let i = 0; i < N; i++) {
  try { res.push(playOnce(i)); } catch (e) { res.push({ ok: false, err: e.message }); }
}
const ok = res.filter(r => r.ok);
const turns = ok.map(r => r.turns).sort((a, b) => a - b);
console.log(`완주 ${ok.length}/${N}, 걸린 턴 중앙값 ${turns[Math.floor(turns.length / 2)]} (최소 ${turns[0]}, 최대 ${turns[turns.length - 1]}), 공격 1회로 함락 ${ok.filter(r => r.assaults === 1).length}/${ok.length}`);
const bad = res.filter(r => !r.ok);
if (bad.length) { console.log('실패 예:', JSON.stringify(bad.slice(0, 5))); process.exit(1); }
