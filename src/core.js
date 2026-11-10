// ===== 삼국쟁투 규칙 엔진 (화면과 무관, Node에서도 돈다) =====
var GUNUNG = (function () {
  const SAVE_VER = 2;
  const TUT_SEED = 3;
  const SAVE_KEY = 'gunung_save';
  const _hooks = { planCity: null };

  // ---------- 난수 ----------
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 게임 상태 안에 난수 상태를 두어 저장·불러오기 후에도 같은 흐름이 이어진다
  function grng(G) {
    return function () {
      const r = makeRng(G.rs)();
      G.rs = (G.rs * 1664525 + 1013904223) >>> 0;
      return r;
    };
  }
  // 한국어 조사: 받침이 있으면 a, 없으면 b
  function J(w, a, b) {
    w = String(w); const ch = w.charCodeAt(w.length - 1);
    if (ch < 0xAC00 || ch > 0xD7A3) return w + a + '(' + b + ')';
    return w + ((ch - 0xAC00) % 28 ? a : b);
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

  // ---------- 새 게임 ----------
  function newGame(factionId, seed, opts) {
    const G = {
      saveVer: SAVE_VER, year: 191, month: 1, turn: 0, seed: seed || 1, rs: (seed || 1) * 7919 + 13,
      playerFaction: factionId, factions: {}, cities: {}, gens: {}, sieges: [], nextSiege: 1,
      log: [], opts: Object.assign({ virtual: true }, opts || {}), over: null, replays: [], tut: null,
    };
    for (const f of DATA.FACTIONS) {
      const r = DATA.GENERALS.find(g => g.id === f.ruler);
      G.factions[f.id] = { id: f.id, name: f.name, color: f.color, ruler: f.ruler, capital: r.city, alive: true, tax: 'normal' };
    }
    for (const c of DATA.CITIES) {
      const owner = Object.values(G.factions).find(f => f.capital === c.id)?.id
        || (DATA.GENERALS.find(g => g.city === c.id && g.faction && g.appear <= 191)?.faction) || null;
      G.cities[c.id] = {
        id: c.id, name: c.name, region: c.region, x: c.x, y: c.y, adj: c.adj.slice(), owner,
        pop: c.pop, agri: c.agri, comm: c.comm, agriMax: 1000, commMax: 1000,
        wall: c.wallMax, wallMax: c.wallMax, gold: 2500 + Math.round(c.comm * 3), food: 20000 + c.agri * 40,
        troops: c.troops, wounded: 0, train: 50, loyalty: 60, policy: 'auto', target: null, direct: false,
      };
    }
    for (const d of DATA.GENERALS) {
      const g = JSON.parse(JSON.stringify(d));
      g.alive = g.appear <= 191 && g.death > 191;
      g.dead = g.death <= 191;
      g.task = 'rest'; g.arg = null; g.army = null; g.virtual = false;
      if (!g.alive) { g.homeFaction = g.faction; g.faction = null; }
      G.gens[g.id] = g;
    }
    if (factionId) {
      G.cities[G.factions[factionId].capital].direct = true;
      addLog(G, `${G.factions[factionId].name} 세력으로 천하에 나섰습니다.`);
    } else G.playerFaction = null;
    return G;
  }

  // ---------- 튜토리얼: 연습 판과 보호 ----------
  function newTutorial() {
    const G = newGame('cao', TUT_SEED, { virtual: true });
    G.tut = { step: 1, protect: true, done: false };
    return G;
  }
  // 튜토리얼 동안 AI가 노리지 못하는 성: 허창과 조조의 성
  function isProtected(G, cityId) {
    if (!G.tut || !G.tut.protect) return false;
    return cityId === 'xuchang' || (G.cities[cityId] && G.cities[cityId].owner === 'cao');
  }
  function tutSkip(G) { if (G.tut) { G.tut.protect = false; G.tut.done = true; } }

  // 11단계. say = 순욱의 말, todo = ▶ 할 일 한 줄
  const TUT_STEPS = [
    { id: 'intro', say: '주공, 동탁이 천하를 어지럽히니 우리도 기반을 다져야 합니다. 먼저 남쪽의 빈 성 허창을 손에 넣으시지요.', todo: '「다음」을 누르세요' },
    { id: 'hud', say: '위쪽에는 날짜와 우리 세력의 금·식량·병력이 있고, 지도에는 성마다 주인의 색과 병력이 보입니다.', todo: '「다음」을 누르세요' },
    { id: 'openCap', say: '먼저 우리의 근거지 진류를 살펴보시지요.', todo: '지도에서 진류 성을 누르세요' },
    { id: 'stats', say: '인구가 많을수록 병사를 많이 뽑을 수 있고, 민심이 낮으면 세금과 징병이 줄어듭니다.', todo: '「다음」을 누르세요' },
    { id: 'recruit', say: '수도의 장수에게는 직접 일을 맡깁니다. 하후돈 장군에게 병사를 모으게 하시지요.', todo: '하후돈의 할 일을 「징병」으로 바꾸세요' },
    { id: 'delegate', say: '다른 성은 태수에게 방침만 내리시면 됩니다. 복양을 보시지요.', todo: '지도에서 복양 성을 누르세요' },
    { id: 'endTurn1', say: '한 달을 보내 보시지요. 맡긴 일은 바꾸실 때까지 계속됩니다.', todo: '위쪽 「턴 종료」를 누르고, 보고서는 「확인」', endTurn: true },
    { id: 'march', say: '이제 출진입니다. 첫 부대가 총대장이 되며, 기병은 궁병에 강하고 보병은 기병에 강합니다.', todo: '진류를 누르고 「출진」 → 목표 허창 → 「출진」' },
    { id: 'siege', say: '성은 곧바로 치지 않고 먼저 에워쌉니다. 에워쌀수록 성안의 식량과 사기가 떨어집니다.', todo: '「턴 종료」를 누르세요(포위 2턴째까지)', endTurn: true },
    { id: 'assault', say: '포위 판에 「지금 치면 예상 승률」이 보입니다. 이만하면 충분합니다.', todo: '포위 판의 「공격」을 누르고 「턴 종료」', endTurn: true },
    { id: 'victory', say: '사다리를 걸고 성문을 부수면 기병이 성안으로 돌입합니다. 허창을 얻었습니다. 감축드립니다, 주공!', todo: '「다음」을 누르면 연습이 끝납니다' },
  ];
  const TUT_SIEGE_TURNS = 2;
  function tutDone(G) { if (G.tut) { G.tut.protect = false; G.tut.done = true; } }
  // 5단계에서 징병을 맡길 장수: 하후돈, 없으면 진류에서 통솔이 가장 높은 장수
  function tutRecruiter(G) {
    const here = officersIn(G, 'chenliu');
    if (here.some(g => g.id === 'xiahoudun')) return 'xiahoudun';
    const best = here.sort((a, b) => b.lead - a.lead)[0];
    return best ? best.id : null;
  }
  const tutStepId = G => (G.tut && !G.tut.done ? TUT_STEPS[G.tut.step - 1].id : null);
  function tutCanEndTurn(G) {
    const id = tutStepId(G);
    return !id || !!TUT_STEPS[G.tut.step - 1].endTurn;
  }
  // 사건 ev가 들어올 때마다 단계를 판정한다. 단계가 바뀌면 true
  function tutCheck(G, ev) {
    const id = tutStepId(G);
    if (!id) return false;
    const before = G.tut.step;
    const go = n => { G.tut.step = n; };
    const siege = G.sieges.find(s => s.att === 'cao' && s.to === 'xuchang');
    const won = G.cities.xuchang.owner === 'cao';
    switch (id) {
      case 'intro': case 'hud': case 'stats': if (ev.type === 'next') go(before + 1); break;
      case 'openCap': if (ev.type === 'select' && ev.city === 'chenliu') go(4); break;
      case 'recruit': {
        // 하후돈이 진류에 없으면(먼저 출진 등) 진류의 어느 장수든 징병이면 된다
        const xh = G.gens.xiahoudun, here = officersIn(G, 'chenliu');
        const ok = here.includes(xh) ? xh.task === 'recruit' : here.some(g => g.task === 'recruit');
        if (ok) go(6);
        break;
      }
      case 'delegate': if (ev.type === 'select' && ev.city === 'puyang') go(7); break;
      case 'endTurn1': if (ev.type === 'turn') go(8); break;
      case 'march': if (won) go(11); else if (siege) { G.tut.retry = false; go(9); } break;
      case 'siege': case 'assault':
        if (ev.type === 'battle' && !ev.won) G.tut.retry = true;
        if (won) go(11);
        else if (!siege) go(8);
        else if (id === 'siege' && siege.turns >= TUT_SIEGE_TURNS) go(10);
        break;
      case 'victory': if (ev.type === 'next') { tutDone(G); return true; } break;
    }
    // 허창을 얻는 즉시 휴전·보호를 푼다(마무리 창은 「다음」에서)
    if (G.tut.step === 11) G.tut.protect = false;
    return G.tut.step !== before;
  }

  function addLog(G, text, kind) {
    G.log.push({ y: G.year, m: G.month, text, kind: kind || 'info' });
    if (G.log.length > 120) G.log.splice(0, G.log.length - 120);
  }

  // ---------- 조회 도우미 ----------
  const gensIn = (G, cityId) => Object.values(G.gens).filter(g => g.alive && g.city === cityId);
  const officersIn = (G, cityId) => {
    const c = G.cities[cityId];
    return gensIn(G, cityId).filter(g => g.faction && g.faction === c.owner && !g.army);
  };
  const roninIn = (G, cityId) => gensIn(G, cityId).filter(g => !g.faction);
  const citiesOf = (G, fid) => Object.values(G.cities).filter(c => c.owner === fid);
  const isEnemy = (G, c, other) => other.owner !== c.owner;
  function bestType(g, siegeDef) {
    let best = 'inf', bv = -1;
    for (const t of ['inf', 'arc', 'cav']) {
      if (siegeDef && t === 'cav') continue;
      const v = DATA.APT[g.apt[t]];
      if (v > bv) { bv = v; best = t; }
    }
    return best;
  }
  const unitCap = g => Math.round(g.lead * 250);
  let RECRUIT_CAP = 0.18, AI_ATK_POLICY = 0.9, AI_ATK_GO = 0.85;
  function tuneAI(o) { if ('RECRUIT_CAP' in o) RECRUIT_CAP = o.RECRUIT_CAP; if ('AI_ATK_POLICY' in o) AI_ATK_POLICY = o.AI_ATK_POLICY; if ('AI_ATK_GO' in o) AI_ATK_GO = o.AI_ATK_GO; }

  // ---------- 내정 ----------
  function recruitAmount(c, g) {
    return Math.max(100, Math.round(c.pop * 0.02 * (0.6 + g.lead / 200 + g.pol / 400)));
  }
  function doRecruit(G, c, g) {
    let amt = recruitAmount(c, g);
    const cost = amt * 0.1;
    if (c.gold < cost) amt = Math.floor(c.gold / 0.1);
    amt = Math.min(amt, Math.floor(c.pop * 0.5));
    if (amt <= 0) return 0;
    c.gold -= amt * 0.1;
    c.troops += amt;
    c.pop -= amt;
    c.loyalty = clamp(c.loyalty - 3, 0, 100);
    c.train = Math.round(c.train * c.troops / (c.troops + amt * 0.5));
    return amt;
  }
  const woundedFrom = (lost, won) => Math.round(lost * (won ? 0.4 : 0.2));
  function healWounded(c) {
    const back = Math.round(c.wounded * 0.25);
    c.wounded -= back; c.troops += back;
    return back;
  }
  const towersFor = wall => Math.min(4, Math.floor(wall / 1000));

  function sabotage(G, g, city, rng, besieged) {
    const p = 0.4 + (g.int - 50) / 100 + (besieged ? 0.2 : 0);
    if (rng() < p) {
      const dmg = Math.round(150 + g.int * 3);
      city.wall = Math.max(0, city.wall - dmg);
      return { ok: true, dmg };
    }
    return { ok: false, dmg: 0 };
  }

  // ---------- 가상 인재 ----------
  function makeVirtual(region, cityId, rng, year) {
    const bias = DATA.REGIONS[region].bias;
    const apt = {};
    for (const t of ['inf', 'arc', 'cav']) {
      const r = rng();
      const base = r < 0.15 ? -1 : r < 0.65 ? 0 : 1;
      apt[t] = DATA.APT_RANK[clamp(1 + base + bias[t], 0, 3)];
    }
    const roll = (lo, hi) => Math.round(lo + (hi - lo) * (rng() + rng()) / 2);
    const age = 18 + Math.floor(rng() * 15);
    return {
      id: 'v' + Math.floor(rng() * 1e9).toString(36) + Math.floor(rng() * 1e6).toString(36),
      name: pick(DATA.NAMES.sur, rng) + pick(DATA.NAMES.given, rng),
      faction: null, city: cityId, birth: year - age, death: year - age + 50 + Math.floor(rng() * 20),
      lead: roll(40, 82), war: roll(35, 85), int: roll(30, 82), pol: roll(30, 82), apt,
      parent: null, appear: year, alive: true, dead: false, task: 'rest', arg: null, army: null, virtual: true,
    };
  }
  function yearlyTalent(G, rng) {
    if (!G.opts.virtual) return;
    for (const c of Object.values(G.cities)) {
      const here = gensIn(G, c.id);
      const virt = here.filter(g => g.virtual && !g.faction).length;
      if (here.length < 3 && virt < 3 && rng() < 0.35) {
        const g = makeVirtual(c.region, c.id, rng, G.year);
        G.gens[g.id] = g;
        addLog(G, `${c.name}에 재야 인재 ${J(g.name, '이', '가')} 이름을 알리기 시작했습니다.`);
      }
    }
  }

  // ---------- 1년마다: 나이, 사망, 2세 ----------
  function yearly(G, rng) {
    for (const g of Object.values(G.gens)) {
      if (g.alive && G.year >= g.death) killGen(G, g);
    }
    for (const g of Object.values(G.gens)) {
      if (!g.alive && !g.dead && G.year >= g.appear && G.year < g.death) {
        g.alive = true;
        const hf = g.homeFaction && G.factions[g.homeFaction];
        const parent = g.parent && G.gens[g.parent];
        if (hf && hf.alive) {
          g.faction = hf.id;
          g.city = parent && parent.alive && parent.faction === hf.id && G.cities[parent.city].owner === hf.id ? parent.city : hf.capital;
          addLog(G, `${J(g.name, '이', '가')} 장성하여 ${hf.name} 휘하에 들었습니다.`);
        } else {
          g.faction = null;
          addLog(G, `${G.cities[g.city].name}에 ${J(g.name, '이', '가')} 재야로 나타났습니다.`);
        }
      }
    }
    yearlyTalent(G, rng);
  }
  function killGen(G, g) {
    g.alive = false; g.dead = true;
    const f = g.faction && G.factions[g.faction];
    addLog(G, `${J(g.name, '이', '가')} 세상을 떠났습니다.`, 'death');
    if (g.army) {
      const s = G.sieges.find(x => x.id === g.army);
      if (s) s.units = s.units.filter(u => u.gen !== g.id);
    }
    g.army = null;
    if (f && f.ruler === g.id) succeed(G, f, g);
  }
  function succeed(G, f, old) {
    const cands = Object.values(G.gens).filter(x => x.alive && x.faction === f.id);
    if (!cands.length) { destroyFaction(G, f); return; }
    const heirs = cands.filter(x => x.parent === old.id).sort((a, b) => a.birth - b.birth);
    const next = heirs[0] || cands.sort((a, b) => b.lead - a.lead)[0];
    f.ruler = next.id;
    f.name = next.name;
    addLog(G, `${J(next.name, '이', '가')} 뒤를 이어 군주가 되었습니다.`, 'big');
  }
  function destroyFaction(G, f) {
    f.alive = false;
    for (const c of citiesOf(G, f.id)) { c.owner = null; c.direct = false; }
    for (const g of Object.values(G.gens)) if (g.faction === f.id) { g.faction = null; g.task = 'rest'; g.army = null; }
    G.sieges = G.sieges.filter(s => s.att !== f.id);
    addLog(G, `${f.name} 세력이 멸망했습니다.`, 'big');
  }

  // ---------- 장수 할 일 ----------
  const TASKS = {
    rest: '대기', agri: '농업 개발', comm: '상업 개발', wall: '성벽 보수', recruit: '징병', train: '훈련',
    search: '인재 탐색', hire: '등용', sabotage: '파괴공작', move: '이동',
  };
  function setTask(G, genId, task, arg) {
    const g = G.gens[genId];
    if (!g || !g.alive || g.army || !TASKS[task]) return false;
    g.task = task; g.arg = arg == null ? null : arg;
    return true;
  }
  function runTask(G, g, rng) {
    const c = G.cities[g.city];
    if (!c || c.owner !== g.faction) return;
    const besieged = G.sieges.some(s => s.to === c.id);
    switch (g.task) {
      case 'agri': if (c.gold >= 100) { c.gold -= 100; c.agri = Math.min(c.agriMax, c.agri + Math.round(6 + g.pol / 10)); } break;
      case 'comm': if (c.gold >= 100) { c.gold -= 100; c.comm = Math.min(c.commMax, c.comm + Math.round(6 + g.pol / 10)); } break;
      case 'wall': if (c.gold >= 150) { c.gold -= 150; c.wall = Math.min(c.wallMax, c.wall + Math.round(100 + g.pol * 2)); } break;
      case 'recruit': if (!besieged) doRecruit(G, c, g); break;
      case 'train': c.train = Math.min(100, c.train + Math.round(4 + g.lead / 20)); break;
      case 'search':
        if (G.opts.virtual && rng() < 0.15 + g.int / 500) {
          const v = makeVirtual(c.region, c.id, rng, G.year); G.gens[v.id] = v;
          if (c.owner === G.playerFaction) addLog(G, `${J(g.name, '이', '가')} ${c.name}에서 ${J(v.name, '을', '를')} 찾아냈습니다.`);
        }
        g.task = 'rest'; break;
      case 'hire': {
        const t = G.gens[g.arg];
        if (t && t.alive && !t.faction && t.city === c.id) {
          const p = 0.35 + (g.pol - 50) / 150 + (t.virtual ? 0.15 : 0);
          if (rng() < p) {
            t.faction = c.owner; t.task = 'rest';
            addLog(G, `${J(t.name, '이', '가')} ${G.factions[c.owner].name} 세력에 합류했습니다.`, c.owner === G.playerFaction ? 'good' : 'info');
          } else if (c.owner === G.playerFaction) addLog(G, `${t.name} 등용에 실패했습니다.`);
        }
        g.task = 'rest'; g.arg = null; break;
      }
      case 'sabotage': {
        const t = G.cities[g.arg];
        if (t && t.owner !== c.owner && c.adj.includes(t.id) && c.gold >= 200) {
          c.gold -= 200;
          const r = sabotage(G, g, t, rng, G.sieges.some(s => s.to === t.id && s.att === c.owner));
          if (c.owner === G.playerFaction) addLog(G, r.ok ? `${g.name}의 파괴공작으로 ${t.name} 성벽이 ${r.dmg} 깎였습니다.` : `${g.name}의 ${t.name} 파괴공작이 들켰습니다.`);
        }
        g.task = 'rest'; g.arg = null; break;
      }
      case 'move': {
        const t = G.cities[g.arg];
        if (t && t.owner === g.faction) g.city = t.id;
        g.task = 'rest'; g.arg = null; break;
      }
    }
  }

  // ---------- 위임 AI (적 AI와 같은 코드) ----------
  function powerOf(troops, gens) {
    if (!gens.length) return troops * 0.75;
    const avg = gens.reduce((s, g) => s + (g.lead + g.war) / 200, 0) / gens.length;
    return troops * (0.5 + avg);
  }
  function defenseOf(G, c) {
    return powerOf(c.troops, officersIn(G, c.id).slice(0, 4)) * (1 + 0.8 * c.wall / 4000);
  }
  function attackPotential(G, c) {
    const offs = officersIn(G, c.id).sort((a, b) => b.lead - a.lead).slice(0, 4);
    return powerOf(Math.min(c.troops * 0.7, offs.reduce((s, g) => s + unitCap(g), 0)), offs);
  }
  function aiPolicy(G, c) {
    const fronts = c.adj.map(id => G.cities[id]).filter(o => isEnemy(G, c, o));
    if (!fronts.length) return { policy: 'dev' };
    if (c.troops < 15000) return { policy: 'mil' };
    if (c.owner !== G.playerFaction) {
      const mine = attackPotential(G, c);
      const tgt = fronts.filter(o => !isProtected(G, o.id)).map(o => ({ o, d: defenseOf(G, o) })).sort((a, b) => a.d - b.d)[0];
      if (tgt && mine > tgt.d * AI_ATK_POLICY) return { policy: 'atk', target: tgt.o.id };
    }
    return { policy: c.troops < c.pop * RECRUIT_CAP * 0.7 ? 'mil' : 'def' };
  }
  function effectivePolicy(G, c) {
    if (c.policy === 'auto' || c.owner !== G.playerFaction) return aiPolicy(G, c);
    if (c.policy === 'atk' && !(c.target && G.cities[c.target] && G.cities[c.target].owner !== c.owner && c.adj.includes(c.target))) return { policy: 'mil' };
    return { policy: c.policy, target: c.target };
  }
  function planCity(G, cityId) {
    const c = G.cities[cityId];
    if (!c.owner || c.direct) return null;
    const pol = effectivePolicy(G, c);
    c.cur = pol;
    const offs = officersIn(G, cityId).sort((a, b) => b.pol - a.pol);
    if (!offs.length) return pol;
    const ronin = roninIn(G, cityId).sort((a, b) => (b.lead + b.war + b.int) - (a.lead + a.war + a.int));
    const free = offs.slice();
    const take = (sorter) => { free.sort(sorter); return free.shift(); };
    if (ronin.length && free.length) { const g = take((a, b) => b.pol - a.pol); g.task = 'hire'; g.arg = ronin[0].id; }
    const canRecruit = c.loyalty >= 35 && c.pop > 40000 && c.troops < c.pop * RECRUIT_CAP && c.gold > 300;
    const devTask = () => (c.agri / c.agriMax <= c.comm / c.commMax ? 'agri' : 'comm');
    if (pol.policy === 'dev') {
      if (free.length && c.wall < c.wallMax * 0.6) { const g = take((a, b) => b.pol - a.pol); g.task = 'wall'; }
      for (const g of free) g.task = devTask();
      if (free.length >= 3 && G.opts.virtual && gensIn(G, c.id).length < 4) free[free.length - 1].task = 'search';
    } else {
      if (free.length && canRecruit) { const g = take((a, b) => b.lead - a.lead); g.task = 'recruit'; }
      if (pol.policy === 'def' && free.length && c.wall < c.wallMax) { const g = take((a, b) => b.pol - a.pol); g.task = 'wall'; }
      for (const g of free) g.task = c.train < 85 ? 'train' : (c.gold < 800 ? 'comm' : devTask());
      if (!canRecruit && free.length > 1 && c.gold < 600) free[0].task = 'comm';
    }
    for (const g of offs) if (g.task !== 'hire' && g.task !== 'sabotage') g.arg = null;
    return pol;
  }

  function aiMilitary(G, rng) {
    for (const c of Object.values(G.cities)) {
      if (!c.owner || c.direct || !c.cur || c.cur.policy !== 'atk') continue;
      if (c.owner === G.playerFaction && c.policy !== 'atk') continue;
      const t = G.cities[c.cur.target];
      if (t && c.owner !== G.playerFaction && isProtected(G, t.id)) continue;
      if (!t || t.owner === c.owner || G.sieges.some(s => s.from === c.id || (s.to === t.id && s.att === c.owner))) continue;
      const offs = officersIn(G, c.id).sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
      if (!offs.length) continue;
      const n = Math.min(4, offs.length > 1 ? offs.length - (offs.length > 2 ? 1 : 0) : 1);
      const pickG = offs.slice(0, n);
      const pool = Math.round(c.troops * 0.55);
      // 비운 성을 이웃이 노리지 않을 만큼은 남긴다
      const threat = c.adj.map(id => G.cities[id]).filter(o => o.owner && o.owner !== c.owner && o.id !== t.id).reduce((m, o) => Math.max(m, attackPotential(G, o)), 0);
      if (powerOf(c.troops - pool, officersIn(G, c.id).slice(n, n + 2)) * (1 + 0.8 * c.wall / 4000) < threat * 0.35) continue;
      const capSum = pickG.reduce((s, g) => s + unitCap(g), 0);
      const units = pickG.map(g => ({ gen: g.id, type: bestType(g), troops: Math.round(Math.min(unitCap(g), pool * unitCap(g) / capSum)) }));
      if (powerOf(units.reduce((s, u) => s + u.troops, 0), pickG) < defenseOf(G, t) * AI_ATK_GO * (0.85 + 0.3 * rng())) continue;
      const s = launchAttack(G, c.id, t.id, units, 'normal');
      if (s) s.auto = true;
    }
  }

  // AI 세력: 장수가 몰린 후방 도시에서 장수가 모자란 전선 도시로 한 명씩 보낸다
  function aiShuffle(G) {
    for (const f of Object.values(G.factions)) {
      if (!f.alive || f.id === G.playerFaction) continue;
      const cs = citiesOf(G, f.id);
      if (cs.length < 2) continue;
      const front = c => c.adj.some(id => G.cities[id].owner !== f.id);
      const need = cs.filter(c => !G.sieges.some(s => s.to === c.id)).sort((a, b) => officersIn(G, a.id).length - officersIn(G, b.id).length)[0];
      const give = cs.slice().sort((a, b) => (officersIn(G, b.id).length - (front(b) ? 2 : 0)) - (officersIn(G, a.id).length - (front(a) ? 2 : 0)))[0];
      if (!need || !give || need === give) continue;
      const nGive = officersIn(G, give.id).length, nNeed = officersIn(G, need.id).length;
      if (nGive - nNeed < 2) continue;
      const g = officersIn(G, give.id).filter(x => x.id !== f.ruler).sort((a, b) => (b.lead + b.war) - (a.lead + a.war))[0];
      if (g) g.city = need.id;
    }
  }

  // 출진 창 기본값(화면·튜토리얼·시험이 같은 값을 쓴다): 통솔+무력 상위 3명, 각자 잘 맞는 병종, 성 병력 60%를 통솔 한도 비례로
  function defaultArmy(G, fromId) {
    const c = G.cities[fromId];
    const offs = officersIn(G, fromId).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 3);
    if (!offs.length) return [];
    const pool = Math.floor(c.troops * 0.6);
    const cap = offs.reduce((a, g) => a + unitCap(g), 0);
    return offs.map(g => ({ gen: g.id, type: bestType(g), troops: Math.max(100, Math.min(unitCap(g), Math.floor(pool * unitCap(g) / cap / 100) * 100)) }));
  }

  // ---------- 출진과 포위 ----------
  function launchAttack(G, fromId, toId, units, tactic) {
    const from = G.cities[fromId], to = G.cities[toId];
    if (!from || !to || !from.owner || from.owner === to.owner || !from.adj.includes(toId)) return null;
    if (G.sieges.some(s => s.to === toId && s.att === from.owner)) return null;
    if (!units.length || units.length > 4) return null;
    let total = 0;
    for (const u of units) {
      const g = G.gens[u.gen];
      if (!g || !g.alive || g.faction !== from.owner || g.city !== fromId || g.army) return null;
      if (!DATA.UNIT[u.type] || u.troops < 100 || u.troops > unitCap(g)) return null;
      total += u.troops;
    }
    if (total > from.troops) return null;
    from.troops -= total;
    const s = {
      id: G.nextSiege++, att: from.owner, from: fromId, to: toId, tactic: tactic || 'normal',
      units: units.map(u => ({ gen: u.gen, type: u.type, troops: Math.round(u.troops), train: from.train })),
      turns: 0, defMorale: 100, attMorale: 100, order: 'hold', auto: false, fresh: true,
    };
    for (const u of s.units) { const g = G.gens[u.gen]; g.army = s.id; g.task = 'rest'; g.arg = null; }
    G.sieges.push(s);
    addLog(G, `${G.factions[from.owner].name} 군이 ${from.name}에서 출진해 ${J(to.name, '을', '를')} 포위했습니다.`, (from.owner === G.playerFaction || to.owner === G.playerFaction) ? 'war' : 'info');
    return s;
  }
  function siegeOrder(G, siegeId, order) {
    const s = G.sieges.find(x => x.id === siegeId);
    if (!s || !['hold', 'assault', 'retreat', 'sabotage'].includes(order)) return false;
    s.order = order; return true;
  }
  function tickSieges(G) {
    for (const s of G.sieges) {
      const c = G.cities[s.to];
      c.food = Math.max(0, c.food - Math.max(800, Math.round(c.troops * 0.08)));
      s.defMorale = clamp(s.defMorale - 8 - (c.food <= 0 ? 15 : 0), 20, 100);
      const from = G.cities[s.from];
      const need = Math.round(s.units.reduce((a, u) => a + u.troops, 0) * 0.06);
      if (from.owner === s.att && from.food >= need) from.food -= need;
      else s.attMorale = clamp(s.attMorale - 15, 0, 100);
      s.turns++;
    }
  }
  const armyTroops = s => s.units.reduce((a, u) => a + u.troops, 0);
  function toBattleUnits(G, list) {
    return list.map(u => ({ gen: Object.assign({}, G.gens[u.gen] || u.genObj), type: u.type, troops: u.troops, train: u.train }));
  }
  function defenderUnits(G, c, forSiege) {
    const offs = officersIn(G, c.id).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 4);
    if (!offs.length) {
      return c.troops > 0 ? [{ gen: '_militia', genObj: militia(c), type: forSiege ? 'arc' : 'inf', troops: c.troops, train: c.train }] : [];
    }
    const per = Math.floor(c.troops / offs.length);
    return offs.map(g => ({ gen: g.id, type: bestType(g, forSiege), troops: per, train: c.train }));
  }
  const militia = c => ({ id: '_militia', name: c.name + ' 향병', lead: 45, war: 45, int: 30, pol: 30, apt: { inf: 'B', arc: 'B', cav: 'C' } });

  function estimateAssault(G, s, rng) {
    const c = G.cities[s.to];
    const att = toBattleUnits(G, s.units), def = toBattleUnits(G, defenderUnits(G, c, true));
    if (!def.length) return 1;
    let wins = 0;
    for (let i = 0; i < 3; i++) {
      const r = simulateBattle(att, def, siegeCtx(c, s), makeRng(Math.floor(rng() * 1e9)), true);
      if (r.winner === 0) wins++;
    }
    return wins / 3;
  }
  // 지금 성을 치면 이길 확률(같은 규칙으로 n번 돌려 본 값). 화면의 「예상 승률」에 쓴다
  function assaultOdds(G, s, n) {
    const c = G.cities[s.to];
    const def = toBattleUnits(G, defenderUnits(G, c, true));
    if (!def.length) return 1;
    const att = toBattleUnits(G, s.units);
    let w = 0;
    for (let i = 0; i < n; i++) if (simulateBattle(att, def, siegeCtx(c, s), makeRng(1000 + i * 97 + G.turn), true).winner === 0) w++;
    return w / n;
  }
  const siegeCtx = (c, s) => ({ siege: true, wall: c.wall, wallMax: c.wallMax, defMorale: s.defMorale, attMorale: s.attMorale, tactic: s.tactic });

  function resolveSieges(G, rng) {
    for (const s of G.sieges.slice()) {
      if (!G.sieges.includes(s)) continue;
      const c = G.cities[s.to];
      if (!s.units.length || c.owner === s.att) { endSiege(G, s, 'home'); continue; }
      if (G.factions[s.att] && !G.factions[s.att].alive) { G.sieges = G.sieges.filter(x => x !== s); continue; }
      const playerArmy = s.att === G.playerFaction && !s.auto;
      const involvesPlayer = s.att === G.playerFaction || c.owner === G.playerFaction;
      // 수비 측 출격(구원군 포함) — 수비 판단도 위임 AI가 같은 규칙으로 한다
      if (!s.fresh && c.owner) {
        const relief = c.adj.map(id => G.cities[id]).filter(o => o.owner === c.owner && !G.sieges.some(x => x.to === o.id) && o.troops > 15000 && officersIn(G, o.id).length)
          .sort((a, b) => b.troops - a.troops)[0];
        const defU = defenderUnits(G, c, false).slice(0, relief ? 2 : 4);
        let relU = [];
        if (relief) {
          const ro = officersIn(G, relief.id).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 2);
          const pool = Math.round(relief.troops * 0.6);
          relU = ro.map(g => ({ gen: g.id, type: bestType(g), troops: Math.min(unitCap(g), Math.floor(pool / ro.length)), train: relief.train, from: relief.id }));
        }
        const field = defU.concat(relU);
        const fieldGens = field.map(u => G.gens[u.gen] || militia(c));
        const fieldPow = powerOf(field.reduce((a, u) => a + u.troops, 0), fieldGens);
        const attPow = powerOf(armyTroops(s), s.units.map(u => G.gens[u.gen]));
        if (field.length && fieldPow > attPow * 1.3) {
          const r = simulateBattle(toBattleUnits(G, s.units), toBattleUnits(G, field), { siege: false, tactic: s.tactic, attMorale: s.attMorale }, makeRng(Math.floor(rng() * 1e9)));
          const defOwner = c.owner;
          applyField(G, s, c, field, r);
          if (involvesPlayer) G.replays.push({ title: `${c.name} 출격전`, result: r, att: s.att, def: defOwner });
          continue;
        }
      }
      if (s.fresh) { s.fresh = false; continue; } // 도착한 턴에는 포위만 한다
      let order = s.order;
      if (!playerArmy) order = aiSiegeOrder(G, s, rng);
      if (order === 'retreat' || s.attMorale <= 0) { endSiege(G, s, 'retreat'); continue; }
      if (order === 'sabotage') {
        const g = s.units.map(u => G.gens[u.gen]).sort((a, b) => b.int - a.int)[0];
        const r = sabotage(G, g, c, rng, true);
        if (involvesPlayer) addLog(G, r.ok ? `${g.name}의 파괴공작으로 ${c.name} 성벽이 ${r.dmg} 깎였습니다(내구 ${c.wall}).` : `${g.name}의 ${c.name} 파괴공작이 실패했습니다.`, 'war');
        if (playerArmy) s.order = 'hold';
        continue;
      }
      if (order !== 'assault') continue;
      if (playerArmy) s.order = 'hold';
      const defU = defenderUnits(G, c, true);
      if (!defU.length) { captureCity(G, s, c, s.units); continue; }
      const r = simulateBattle(toBattleUnits(G, s.units), toBattleUnits(G, defU), siegeCtx(c, s), makeRng(Math.floor(rng() * 1e9)));
      const defOwner = c.owner || null;
      applyAssault(G, s, c, defU, r);
      if (involvesPlayer) G.replays.push({ title: `${c.name} 공성전`, result: r, att: s.att, def: defOwner });
    }
  }
  function aiSiegeOrder(G, s, rng) {
    const c = G.cities[s.to];
    const start = s.startTroops || (s.startTroops = armyTroops(s));
    if (armyTroops(s) < start * 0.3 || s.attMorale < 25) return 'retreat';
    const p = estimateAssault(G, s, rng);
    if (p >= 0.66) return 'assault';
    if (c.wall > c.wallMax * 0.35 && s.turns < 7) return 'sabotage';
    if (s.turns >= 7) return p >= 0.34 ? 'assault' : 'retreat';
    return 'hold';
  }
  function applyBattleLosses(G, list, res, side, won, cityForWounded) {
    let lost = 0;
    list.forEach((u, i) => {
      const after = Math.round(res.units[side][i].troops);
      lost += u.troops - after;
      u.troops = after;
    });
    if (cityForWounded) cityForWounded.wounded += woundedFrom(lost, won);
    return lost;
  }
  function applyField(G, s, c, field, r) {
    const attWon = r.winner === 0;
    applyBattleLosses(G, s.units, r, 0, attWon, G.cities[s.from].owner === s.att ? G.cities[s.from] : null);
    let lostCity = 0;
    field.forEach((u, i) => {
      const after = Math.round(r.units[1][i].troops), lost = u.troops - after;
      const home = u.from ? G.cities[u.from] : c;
      home.troops = Math.max(0, home.troops - lost);
      home.wounded += woundedFrom(lost, !attWon);
      lostCity += lost;
    });
    s.units = s.units.filter(u => u.troops >= 200);
    const tag = `${c.name} 앞 야전`;
    if (attWon) { s.defMorale = clamp(s.defMorale - 20, 20, 100); addLog(G, `${tag}: ${G.factions[s.att].name} 군 승리.`, 'war'); }
    else { addLog(G, `${tag}: 수비 측이 포위를 풀었습니다.`, 'war'); endSiege(G, s, 'retreat'); }
  }
  function applyAssault(G, s, c, defU, r) {
    const attWon = r.winner === 0;
    applyBattleLosses(G, s.units, r, 0, attWon, null);
    let defLost = 0;
    defU.forEach((u, i) => { defLost += u.troops - Math.round(r.units[1][i].troops); });
    c.troops = Math.max(0, c.troops - defLost);
    c.wounded += woundedFrom(defLost, !attWon);
    const attLost = r.losses[0];
    s.pendingWounded = (s.pendingWounded || 0) + woundedFrom(attLost, attWon);
    if (r.gateBroken) c.wall = Math.max(0, Math.round(c.wall * 0.8));
    s.units = s.units.filter(u => u.troops >= 200);
    if (attWon) captureCity(G, s, c, s.units);
    else {
      addLog(G, `${c.name} 공성전: 수비 측이 성을 지켜 냈습니다.`, 'war');
      if (!s.units.length) endSiege(G, s, 'retreat');
    }
  }
  function captureCity(G, s, c, units) {
    const oldOwner = c.owner, att = G.factions[s.att];
    // 수비 장수 후퇴
    for (const g of gensIn(G, c.id).filter(g => g.faction === oldOwner)) {
      const back = c.adj.map(id => G.cities[id]).find(o => o.owner === oldOwner && !G.sieges.some(x => x.to === o.id));
      if (back) { g.city = back.id; }
      else { g.faction = null; g.task = 'rest'; }
      g.task = 'rest'; g.arg = null;
    }
    if (oldOwner) {
      const back = c.adj.map(id => G.cities[id]).find(o => o.owner === oldOwner);
      if (back) back.troops += Math.round(c.troops * 0.5);
    }
    c.owner = s.att; c.direct = false; c.policy = 'auto'; c.target = null;
    c.troops = armyTroops(s); c.wounded = s.pendingWounded || 0;
    c.loyalty = clamp(c.loyalty - 10, 0, 100);
    c.train = Math.round(s.units.reduce((a, u) => a + u.train * u.troops, 0) / Math.max(1, armyTroops(s)));
    for (const u of s.units) { const g = G.gens[u.gen]; if (g) { g.city = c.id; g.army = null; g.task = 'rest'; } }
    for (const g of Object.values(G.gens)) if (g.army === s.id) { g.army = null; g.city = s.from; }
    G.sieges = G.sieges.filter(x => x !== s && !(x.to === c.id));
    addLog(G, `${att.name} 세력이 ${J(c.name, '을', '를')} 함락했습니다!`, (s.att === G.playerFaction || oldOwner === G.playerFaction) ? 'big' : 'war');
    if (oldOwner) {
      const f = G.factions[oldOwner];
      const left = citiesOf(G, oldOwner);
      if (!left.length) {
        const r = G.gens[f.ruler]; if (r) r.faction = null;
        destroyFaction(G, f);
      } else if (f.capital === c.id) {
        f.capital = left.sort((a, b) => b.pop - a.pop)[0].id;
        const r = G.gens[f.ruler]; if (r && r.alive) r.city = f.capital;
        if (oldOwner === G.playerFaction) G.cities[f.capital].direct = true;
      }
    }
    if (!oldOwner && att.alive && s.att === G.playerFaction) { /* 빈 성 접수 */ }
  }
  function endSiege(G, s, why) {
    const from = G.cities[s.from];
    const homeOk = from.owner === s.att;
    const home = homeOk ? from : citiesOf(G, s.att)[0];
    for (const u of s.units) {
      const g = G.gens[u.gen]; if (!g) continue;
      g.army = null; g.task = 'rest';
      if (home) { g.city = home.id; } else g.faction = null;
    }
    for (const g of Object.values(G.gens)) if (g.army === s.id) { g.army = null; if (home) g.city = home.id; }
    if (home) { home.troops += armyTroops(s); home.wounded += s.pendingWounded || 0; }
    G.sieges = G.sieges.filter(x => x !== s);
    if (why === 'retreat') addLog(G, `${G.factions[s.att].name} 군이 ${G.cities[s.to].name} 포위를 풀고 물러났습니다.`, (s.att === G.playerFaction || G.cities[s.to].owner === G.playerFaction) ? 'war' : 'info');
  }

  // ---------- 경제 ----------
  const TAX = { low: { mul: 0.7, loy: 1 }, normal: { mul: 1, loy: 0.3 }, high: { mul: 1.35, loy: -1 } };
  function economy(G) {
    for (const c of Object.values(G.cities)) {
      healWounded(c);
      if (!c.owner) { c.troops = Math.min(c.troops + 200, 6000); continue; }
      const f = G.factions[c.owner];
      const tax = TAX[f.tax] || TAX.normal;
      const besieged = G.sieges.some(s => s.to === c.id);
      const ef = 0.5 + c.loyalty / 200;
      c.gold += Math.round(c.comm * 2 * tax.mul * ef * (besieged ? 0.5 : 1));
      if (!besieged) c.food += Math.round(c.agri * 8 * ef);
      c.gold -= Math.round(c.troops * 0.01);
      c.food -= Math.round(c.troops * 0.06);
      if (c.gold < 0) { c.gold = 0; c.loyalty = clamp(c.loyalty - 2, 0, 100); }
      if (c.food < 0) {
        c.food = 0; c.loyalty = clamp(c.loyalty - 5, 0, 100);
        c.troops = Math.round(c.troops * 0.95);
      }
      c.loyalty = clamp(c.loyalty + tax.loy, 0, 100);
      c.pop = Math.round(c.pop * (1 + 0.003 * c.loyalty / 100) + c.agri * 0.5);
      c.pop = Math.min(c.pop, 600000);
    }
    if (G.turn % 3 === 2) {
      for (const f of Object.values(G.factions)) {
        if (!f.alive) continue;
        const cap = G.cities[f.capital];
        if (!cap || cap.owner !== f.id) continue;
        for (const c of citiesOf(G, f.id)) {
          if (c === cap || G.sieges.some(s => s.to === c.id)) continue;
          if (c.gold > 2000) { const m = Math.round((c.gold - 2000) * 0.5); c.gold -= m; cap.gold += m; }
        }
      }
    }
  }

  // ---------- 턴 진행 ----------
  function endTurn(G) {
    if (G.over) return G;
    const rng = grng(G);
    G.replays = [];
    for (const c of Object.values(G.cities)) if (c.owner) (_hooks.planCity || planCity)(G, c.id);
    aiShuffle(G);
    aiMilitary(G, rng);
    for (const g of Object.values(G.gens)) if (g.alive && g.faction && !g.army) runTask(G, g, rng);
    tickSieges(G);
    resolveSieges(G, rng);
    economy(G);
    G.turn++;
    G.month++;
    if (G.month > 12) { G.month = 1; G.year++; yearly(G, rng); }
    for (const f of Object.values(G.factions)) if (f.alive && !citiesOf(G, f.id).length) destroyFaction(G, f);
    checkEnd(G);
    return G;
  }
  function checkEnd(G) {
    if (!G.playerFaction) {
      const owners = new Set(Object.values(G.cities).map(c => c.owner));
      if (owners.size === 1 && !owners.has(null)) { G.over = 'unified'; G.unifiedBy = [...owners][0]; }
      return;
    }
    const pf = G.factions[G.playerFaction];
    if (!pf.alive) { G.over = 'lose'; addLog(G, '세력이 멸망했습니다. 패업은 여기서 끝났습니다.', 'big'); return; }
    if (Object.values(G.cities).every(c => c.owner === G.playerFaction)) { G.over = 'win'; addLog(G, '천하를 통일했습니다!', 'big'); }
  }

  // ---------- 전투 ----------
  const W = 14, H = 8, WALL_X = 10, GATE_Y = 4;
    let GATE_K = 0.4, GATE_DMG = 1.5, SIEGE_ROUNDS = 36, WALL_A = 0.25, WALL_B = 0.30, TOWER_DMG = 100, GATE_SHOCK = 5;
  // 시뮬레이션에서 수치를 바꿔 보기 위한 손잡이
  function tune(o) { if ('GATE_K' in o) GATE_K = o.GATE_K; if ('GATE_DMG' in o) GATE_DMG = o.GATE_DMG; if ('SIEGE_ROUNDS' in o) SIEGE_ROUNDS = o.SIEGE_ROUNDS; if ('WALL_A' in o) WALL_A = o.WALL_A; if ('WALL_B' in o) WALL_B = o.WALL_B; if ('TOWER_DMG' in o) TOWER_DMG = o.TOWER_DMG; if ('GATE_SHOCK' in o) GATE_SHOCK = o.GATE_SHOCK; return { GATE_K, GATE_DMG, SIEGE_ROUNDS, WALL_A, WALL_B, TOWER_DMG, GATE_SHOCK }; }
  const canClimb = t => t !== 'cav';
  const counter = (a, d) => DATA.COUNTER[a][d];

  function battleState(attUnits, defUnits, ctx, rng) {
    ctx = Object.assign({ siege: false, wall: 0, wallMax: 1, defMorale: 100, attMorale: 100, tactic: 'normal' }, ctx || {});
    const units = [];
    const place = (list, side) => {
      const n = list.length;
      list.forEach((u, i) => {
        const g = typeof u.gen === 'object' ? u.gen : { id: u.gen, name: u.gen, lead: 60, war: 60, int: 50, pol: 50, apt: { inf: 'B', arc: 'B', cav: 'B' } };
        let x, y;
        if (side === 0) { x = u.type === 'arc' ? 2 : 3; y = Math.round((i + 1) * H / (n + 1)) - (i % 2 ? 0 : 0); }
        else if (ctx.siege) { x = WALL_X; const slots = [2, 5, 3, 6]; y = slots[i % 4]; }
        else { x = u.type === 'arc' ? W - 3 : W - 4; y = Math.round((i + 1) * H / (n + 1)); }
        y = clamp(y, 0, H - 1);
        units.push({
          uid: side * 10 + i, side, idx: i, gen: g, type: u.type, troops: u.troops, troops0: u.troops,
          train: u.train == null ? 50 : u.train, morale: side === 1 ? (ctx.siege ? ctx.defMorale : 100) : ctx.attMorale,
          x, y, commander: i === 0, routed: false, state: side === 1 && ctx.siege ? 'wall' : 'field', ladder: 0, charged: false,
        });
      });
    };
    place(attUnits, 0); place(defUnits, 1);
    return {
      units, ctx, rng: rng || makeRng(1), round: 0, over: false, winner: null,
      gateHp: ctx.siege ? Math.round(ctx.wall * GATE_K) : 0, gateHp0: ctx.siege ? Math.round(ctx.wall * GATE_K) : 0, gateBroken: !ctx.siege || ctx.wall * GATE_K < 1,
      towers: ctx.siege ? towersFor(ctx.wall) : 0, losses: [0, 0], frames: [], fx: [],
      dmgBy: [{ inf: 0, arc: 0, cav: 0, tower: 0 }, { inf: 0, arc: 0, cav: 0, tower: 0 }],
    };
  }
  const alive = (st, side) => st.units.filter(u => !u.routed && (side == null || u.side === side));
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  function routUnit(st, u) {
    if (u.routed) return;
    u.routed = true;
    st.fx.push({ k: 'rout', x: u.x, y: u.y });
    if (u.commander) for (const o of alive(st, u.side)) o.morale = Math.max(0, o.morale - 30);
    for (const o of alive(st, u.side)) if (o.morale <= 0) routUnit(st, o);
    checkOver(st);
  }
  function checkOver(st) {
    if (st.over) return;
    for (const side of [0, 1]) if (!alive(st, side).length) { st.over = true; st.winner = 1 - side; return; }
  }
  function wallRed(st) { return (WALL_A + WALL_B * clamp(st.ctx.wall / st.ctx.wallMax, 0, 1)) * (st.gateBroken ? 0.5 : 1); }
  function hurt(st, src, tgt, base, label) {
    if (tgt.routed) return;
    let dmg = base;
    if (st.ctx.siege && tgt.side === 1 && tgt.state === 'wall') {
      const red = wallRed(st);
      if (src && src.state === 'inside') dmg *= 1;
      else if (src && src.state === 'climbed') dmg *= 1 - red * 0.5;
      else dmg *= 1 - red;
    }
    const tac = st.ctx.tactic;
    if (tgt.side === 0) dmg *= tac === 'charge' ? 1.1 : tac === 'careful' ? 0.9 : 1;
    if (src && src.side === 0) dmg *= tac === 'charge' ? 1.1 : tac === 'careful' ? 0.9 : 1;
    dmg *= 0.85 + 0.3 * st.rng();
    dmg = Math.min(tgt.troops, Math.max(1, dmg));
    tgt.troops -= dmg;
    st.losses[tgt.side] += dmg;
    st.dmgBy[1 - tgt.side][label] += dmg;
    tgt.morale -= dmg / tgt.troops0 * 70;
    st.fx.push({ k: 'hit', from: src ? [src.x, src.y] : [WALL_X + 1, GATE_Y], to: [tgt.x, tgt.y], label });
    if (tgt.troops < tgt.troops0 * 0.2 || tgt.morale <= 0) routUnit(st, tgt);
  }
  function attackPower(u, tgt, d) {
    const T = DATA.UNIT[u.type];
    let p = u.troops * 0.08 * (0.5 + u.gen.war / 300 + u.gen.lead / 300) * DATA.APT[u.gen.apt[u.type]] * T.atk * (0.7 + u.train / 250);
    const ttype = tgt.side === 1 && tgt.state === 'wall' && tgt.type === 'cav' ? 'inf' : tgt.type;
    p *= counter(u.type, ttype);
    if (u.type === 'arc') { if (d <= 1) p *= 0.5; else if (d >= 4) p *= 0.85; }
    if (u.type === 'cav' && u.moved >= 2) p *= 1.3;
    if (u.state === 'inside' && u.type === 'cav' && !u.charged) { p *= 1.5; u.charged = true; }
    p /= DATA.UNIT[ttype].def * (0.75 + tgt.gen.lead / 400);
    p *= 0.6 + 0.4 * clamp(u.morale, 0, 100) / 100;
    return p;
  }
  const occupied = (st, x, y, self) => st.units.some(o => o !== self && !o.routed && o.x === x && o.y === y);
  function passable(st, u, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (!st.ctx.siege) return true;
    if (u.side === 1) return false;
    if (x === WALL_X) return st.gateBroken && y === GATE_Y;
    if (x > WALL_X) return st.gateBroken;
    return true;
  }
  function stepToward(st, u, tx, ty, steps) {
    let moved = 0;
    for (let s = 0; s < steps; s++) {
      if (u.x === tx && u.y === ty) break;
      let best = null, bd = Math.max(Math.abs(u.x - tx), Math.abs(u.y - ty)) + Math.abs(u.x - tx) * 0.01 + Math.abs(u.y - ty) * 0.01;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = u.x + dx, ny = u.y + dy;
        if (!passable(st, u, nx, ny) || occupied(st, nx, ny, u)) continue;
        const nd = Math.max(Math.abs(nx - tx), Math.abs(ny - ty)) + Math.abs(nx - tx) * 0.01 + Math.abs(ny - ty) * 0.01;
        if (nd < bd - 1e-9) { bd = nd; best = [nx, ny]; }
      }
      if (!best) break;
      u.x = best[0]; u.y = best[1]; moved++;
    }
    if (u.x > WALL_X && st.ctx.siege && u.side === 0) u.state = 'inside';
    u.moved = (u.moved || 0) + moved;
    return moved;
  }
  function nearest(st, u, side, filter) {
    let best = null, bd = 1e9;
    for (const o of alive(st, side)) {
      if (filter && !filter(o)) continue;
      const d = dist(u, o) + o.y * 0.001;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  // 사거리 안의 적 중 가장 많이 상한 부대를 노린다(양쪽 같은 규칙). 없으면 가장 가까운 적에게 다가간다.
  function inRangeTarget(st, u, R, filter) {
    let best = null, bv = 1e9;
    for (const o of alive(st, 1 - u.side)) {
      if (filter && !filter(o)) continue;
      const d = dist(u, o);
      if (d > R) continue;
      let v = o.troops / o.troops0 + d * 0.01;
      if (u.type === 'cav' && o.type === 'arc') v -= 0.5;
      if (u.type === 'arc' && o.type !== 'arc' && d <= 1) v -= 0.2;
      if (v < bv) { bv = v; best = o; }
    }
    return best;
  }
  function chaseTarget(st, u) {
    let best = null, bv = 1e9;
    for (const o of alive(st, 1 - u.side)) {
      let v = dist(u, o) + Math.abs(o.y - u.y) * 0.1 + (o.troops / o.troops0) * 0.5;
      if (u.type === 'cav' && o.type === 'arc') v -= 3;
      if (v < bv) { bv = v; best = o; }
    }
    return best;
  }
  function actField(st, u) {
    const R = DATA.UNIT[u.type].range;
    if (u.type === 'arc') {
      // 궁병은 느린 보병이 붙으려 하면 한 칸 물러서며 쏜다(기병은 못 피한다)
      const near = alive(st, 1 - u.side).filter(o => o.type === 'inf' && dist(u, o) <= 2);
      if (near.length) {
        const back = u.side === 0 ? -1 : 1;
        for (const dy of [0, -1, 1]) {
          const nx = u.x + back, ny = u.y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && !occupied(st, nx, ny, u) && near.every(o => Math.max(Math.abs(nx - o.x), Math.abs(ny - o.y)) >= dist(u, o))) { u.x = nx; u.y = ny; break; }
        }
      }
    }
    let t = inRangeTarget(st, u, R);
    if (!t) {
      const c = chaseTarget(st, u);
      if (!c) return;
      if (u.type === 'arc') {
        // 다가오는 근접 부대가 있으면 제자리에서 기다린다
        if (alive(st, 1 - u.side).some(o => o.type !== 'arc' && dist(u, o) <= 7)) return;
        const dx = Math.sign(c.x - u.x) || (u.side === 0 ? 1 : -1);
        stepToward(st, u, clamp(c.x - dx * R, 0, W - 1), c.y, DATA.UNIT[u.type].move);
      } else stepToward(st, u, c.x, c.y, DATA.UNIT[u.type].move);
      t = inRangeTarget(st, u, R);
    }
    if (t) hurt(st, u, t, attackPower(u, t, dist(u, t)), u.type);
  }
  function actSiegeAttacker(st, u) {
    const defs = alive(st, 1);
    if (!defs.length) return;
    if (u.state === 'inside') {
      const tgt = nearest(st, u, 1);
      if (dist(u, tgt) > 1) stepToward(st, u, tgt.x + 1, tgt.y, DATA.UNIT[u.type].move);
      if (dist(u, tgt) <= 1) hurt(st, u, tgt, attackPower(u, tgt, 1), u.type);
      return;
    }
    if (u.type === 'arc') {
      const tgt = nearest(st, u, 1);
      if (dist(u, tgt) > 4) stepToward(st, u, WALL_X - 4, tgt.y, 2);
      if (dist(u, tgt) <= 4) hurt(st, u, tgt, attackPower(u, tgt, dist(u, tgt)), 'arc');
      return;
    }
    // 성문이 열렸으면 기병·보병은 성 안으로
    if (st.gateBroken && (u.type === 'cav' || u.state !== 'climbed')) {
      stepToward(st, u, WALL_X + 1, GATE_Y, DATA.UNIT[u.type].move);
      if (u.state === 'inside') {
        const tgt = nearest(st, u, 1, o => dist(u, o) <= 1);
        if (tgt) hurt(st, u, tgt, attackPower(u, tgt, 1), u.type);
      }
      return;
    }
    const gateDuty = u.type === 'cav' || (u.gateDuty);
    if (gateDuty) {
      if (!(u.x === WALL_X - 1 && u.y === GATE_Y)) stepToward(st, u, WALL_X - 1, GATE_Y, DATA.UNIT[u.type].move);
      if (u.x === WALL_X - 1 && Math.abs(u.y - GATE_Y) <= 0) {
        const dmg = u.troops * 0.05 * (0.5 + u.gen.war / 300) * (u.type === 'cav' ? 0.6 : 1.0) * 0.8 * GATE_DMG;
        st.gateHp -= dmg;
        st.fx.push({ k: 'gate', from: [u.x, u.y], to: [WALL_X, GATE_Y] });
        if (st.gateHp <= 0) {
          st.gateBroken = true; st.gateHp = 0; st.fx.push({ k: 'gatebreak', x: WALL_X, y: GATE_Y });
          // 성문이 뚫리면 성 안이 동요한다
          for (const o of alive(st, 1)) o.morale = Math.max(1, o.morale - GATE_SHOCK);
        }
      }
      return;
    }
    // 보병: 사다리
    if (u.state === 'climbed') {
      const tgt = nearest(st, u, 1);
      if (dist(u, tgt) > 1) {
        const ny = u.y + Math.sign(tgt.y - u.y);
        if (!occupied(st, u.x, ny, u)) u.y = ny;
      }
      if (dist(u, tgt) <= 1) hurt(st, u, tgt, attackPower(u, tgt, 1), u.type);
      return;
    }
    const tgt = nearest(st, u, 1);
    if (u.x !== WALL_X - 1) { stepToward(st, u, WALL_X - 1, tgt.y, DATA.UNIT[u.type].move); return; }
    if (u.state === 'ladder') { u.state = 'climbed'; return; }
    u.state = 'ladder';
  }
  function actSiegeDefender(st, u) {
    const R = u.type === 'arc' ? 4 : 1;
    const tgt = nearest(st, u, 0, o => dist(u, o) <= R) || (u.type !== 'arc' ? nearest(st, u, 0, o => o.state === 'inside' && dist(u, o) <= 2) : null);
    if (!tgt) return;
    let p = attackPower(u, tgt, dist(u, tgt));
    if (tgt.state === 'ladder') p *= 1.3; // 낙석
    hurt(st, u, tgt, p, u.type === 'cav' ? 'inf' : u.type);
  }
  function battleRound(st) {
    st.round++;
    st.fx = [];
    for (const u of st.units) u.moved = 0;
    if (st.ctx.siege && st.towers > 0) {
      for (let i = 0; i < st.towers; i++) {
        const tgts = alive(st, 0).filter(o => o.x >= WALL_X - 5 && o.state !== 'inside');
        if (!tgts.length) break;
        const t = tgts[(st.round + i) % tgts.length];
        hurt(st, null, t, TOWER_DMG * (0.6 + 0.4 * st.ctx.wall / st.ctx.wallMax), 'tower');
        if (st.over) break;
      }
    }
    // 성문 담당 보병 1부대 지정
    if (st.ctx.siege && !st.gateBroken) {
      const infs = alive(st, 0).filter(o => o.type === 'inf' && o.state === 'field');
      if (infs.length >= 2 && !alive(st, 0).some(o => o.gateDuty)) {
        infs.sort((a, b) => Math.abs(a.y - GATE_Y) - Math.abs(b.y - GATE_Y))[0].gateDuty = true;
      }
    }
    const first = st.rng() < 0.5 ? 0 : 1;
    const order = st.units.slice().sort((a, b) => (a.side === first ? 0 : 1) - (b.side === first ? 0 : 1) || a.idx - b.idx);
    for (const u of order) {
      if (u.routed || st.over) continue;
      if (st.ctx.siege) { if (u.side === 0) actSiegeAttacker(st, u); else actSiegeDefender(st, u); }
      else actField(st, u);
    }
    const limit = st.ctx.siege ? SIEGE_ROUNDS : 30;
    if (!st.over && st.round >= limit) {
      st.over = true;
      if (st.ctx.siege) st.winner = 1;
      else {
        const rem = side => alive(st, side).reduce((a, u) => a + u.troops, 0) / Math.max(1, st.units.filter(u => u.side === side).reduce((a, u) => a + u.troops0, 0));
        st.winner = rem(0) > rem(1) ? 0 : 1;
      }
    }
  }
  function snapshot(st) {
    return {
      r: st.round, gate: st.gateBroken ? 0 : st.gateHp / Math.max(1, st.gateHp0),
      u: st.units.map(u => [u.x, u.y, Math.round(u.troops), u.routed ? 1 : 0, u.state === 'ladder' ? 1 : u.state === 'climbed' ? 2 : u.state === 'inside' ? 3 : 0, Math.round(u.morale)]),
      fx: st.fx.slice(0, 24),
    };
  }
  function simulateBattle(att, def, ctx, rng, noFrames) {
    const st = battleState(att, def, ctx, rng);
    if (!noFrames) st.frames.push(snapshot(st));
    checkOver(st);
    let guard = 0;
    while (!st.over && guard++ < 60) {
      battleRound(st);
      if (!noFrames) st.frames.push(snapshot(st));
    }
    return {
      winner: st.winner, rounds: st.round, losses: st.losses.map(Math.round), frames: st.frames,
      units: [0, 1].map(side => st.units.filter(u => u.side === side).map(u => ({ id: u.gen.id, name: u.gen.name, type: u.type, troops: Math.round(u.troops), troops0: u.troops0, routed: u.routed }))),
      meta: st.units.map(u => ({ side: u.side, name: u.gen.name, type: u.type, commander: u.commander, troops0: u.troops0 })),
      dmgBy: st.dmgBy, gateBroken: st.ctx.siege && st.gateBroken, siege: !!st.ctx.siege, towers: st.towers,
    };
  }

  // ---------- 저장 ----------
  function save(G) {
    const o = Object.assign({}, G, { replays: [] });
    return JSON.stringify(o);
  }
  function migrate(o) {
    if (!o.saveVer) o.saveVer = 0;
    if (o.saveVer < 1) {
      o.opts = Object.assign({ virtual: true }, o.opts || {});
      o.replays = o.replays || [];
      o.saveVer = 1;
    }
    if (o.saveVer < 2) {
      o.tut = o.tut || null;
      o.saveVer = 2;
    }
    return o;
  }
  function load(str) { return migrate(JSON.parse(str)); }

  return {
    SAVE_VER, SAVE_KEY, DATA, TASKS, _hooks, W, H, WALL_X, GATE_Y,
    TUT_SEED, TUT_STEPS, TUT_SIEGE_TURNS, newTutorial, isProtected, tutSkip, tutDone, tutCheck, tutCanEndTurn, tutRecruiter, defaultArmy,
    makeRng, newGame, endTurn, setTask, planCity, aiPolicy, effectivePolicy, launchAttack, siegeOrder, tickSieges,
    recruitAmount, doRecruit, woundedFrom, healWounded, towersFor, sabotage, makeVirtual, yearlyTalent,
    simulateBattle, battleState, routUnit, canClimb, counter, save, load, migrate, unitCap, bestType,
    tuneAI, assaultOdds, J, tune, gensIn, officersIn, roninIn, citiesOf, defenseOf, powerOf, armyTroops,
  };
})();
