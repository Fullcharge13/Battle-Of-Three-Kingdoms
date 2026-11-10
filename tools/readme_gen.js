// 게임 데이터(src/data.js)에서 README.md의 표 부분을 만든다. 사용: node tools/readme_gen.js
const fs = require('fs');
const path = require('path');
const { loadGame } = require('../tests/load');
const K = loadGame();
const D = K.DATA;
const ROOT = path.join(__dirname, '..');
const G = K.newGame('cao', 1);

const fac = D.FACTIONS.map(f => {
  const cs = Object.values(G.cities).filter(c => c.owner === f.id);
  const gs = Object.values(G.gens).filter(g => g.alive && g.faction === f.id);
  return `| ${f.name} | ${cs.map(c => c.name).join(', ')} | ${gs.length} | ${cs.reduce((a, c) => a + c.troops, 0).toLocaleString('ko-KR')} |`;
}).join('\n');
const cities = D.CITIES.map(c => `| ${c.name} | ${D.REGIONS[c.region].name} | ${(c.pop / 10000).toFixed(0)}만 | ${c.wallMax} | ${K.towersFor(c.wallMax)} | ${c.adj.map(id => D.CITIES.find(o => o.id === id).name).join(', ')} |`).join('\n');
const gens = D.GENERALS.map(g => {
  const f = g.faction ? D.FACTIONS.find(x => x.id === g.faction).name : '재야';
  const note = g.appear > 191 ? `${g.appear}년 등장` : '';
  return `| ${g.name} | ${f} | ${g.birth}–${g.death} | ${g.lead}/${g.war}/${g.int}/${g.pol} | ${g.apt.inf}${g.apt.arc}${g.apt.cav} | ${note} |`;
}).join('\n');
const units = Object.entries(D.UNIT).map(([k, u]) => `| ${u.name} | ${u.move} | ${u.range} | ${u.atk} | ${u.def} | ${Object.entries(D.COUNTER[k]).map(([t, v]) => D.UNIT[t].name + '×' + v).join(', ')} |`).join('\n');

const gen = `<!-- 아래는 tools/readme_gen.js 가 자동으로 만든 부분 -->
## 데이터 표 (자동 생성)

### 세력 (191년 1월)
| 세력 | 도시 | 장수 | 병력 |
|---|---|---|---|
${fac}

### 도시
| 도시 | 지역 | 인구 | 성벽 | 수성 시설 | 이웃 |
|---|---|---|---|---|---|
${cities}

### 병종
| 병종 | 이동 | 사거리 | 공격 | 방어 | 상성(이 병종이 때릴 때) |
|---|---|---|---|---|---|
${units}

### 장수 (${D.GENERALS.length}명, 능력치 = 통솔/무력/지력/정치, 적성 = 보궁기)
| 이름 | 소속 | 생몰 | 능력치 | 적성 | 비고 |
|---|---|---|---|---|---|
${gens}
`;
const p = path.join(ROOT, 'README.md');
const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const head = cur.split('<!-- 아래는 tools/readme_gen.js')[0];
fs.writeFileSync(p, head + gen);
console.log('README.md 데이터 표 갱신');
