// ===== 삼국쟁투 화면 =====
(function () {
  const K = GUNUNG, D = K.DATA;
  const VERSION = 'v0.3';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  let G = null, sel = null, modalAt = 0, busy = false, askedOnce = false;

  // ---------- 저장 ----------
  const TUT_KEY = 'samguk_tut', SEEN_KEY = 'samguk_seen';
  function storeGet(key) { try { return localStorage.getItem(key || K.SAVE_KEY); } catch (e) { return null; } }
  function storeSet(v, key) { try { localStorage.setItem(key || K.SAVE_KEY, v); return true; } catch (e) { return false; } }
  function storeDel(key) { try { localStorage.removeItem(key); } catch (e) { /* 저장소 막힘 */ } }
  const inTut = () => !!(G && G.tut && !G.tut.done);
  // 튜토리얼 판은 따로 저장해 본 게임 저장을 덮어쓰지 않는다
  function persist() { return storeSet(K.save(G), inTut() || (G && G.tut && G.tut.done && !G.tut.kept) ? TUT_KEY : K.SAVE_KEY); }

  // ---------- 코드 도트 ----------
  const CASTLE = [
    '..3.....3..',
    '.333...333.',
    '..1.1.1.1..',
    '.111111111.',
    '.122212221.',
    '.122000221.',
    '.122000221.',
    '11111111111',
  ];
  const SOLDIER = {
    inf: ['...3...', '..333..', '.1.2.4.', '.12224.', '.11214.', '..2.2..', '..2.2..'],
    arc: ['...3...', '..333.5', '...2.5.', '..2225.', '...2.5.', '..2.2.5', '..2.2..'],
    cav: ['..3....', '.333...', '..2...6', '.6666666', '66666666', '.6....6.', '.6....6.'],
  };
  function drawGrid(ctx, grid, x, y, px, pal) {
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
      const ch = grid[r][c]; if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch]; ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
  const fcolor = fid => (fid && G && G.factions[fid] ? G.factions[fid].color : '#9a9183');
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }

  // ---------- 첫 화면 ----------
  function drawSeal() {
    const c = $('seal'), x = c.getContext('2d');
    x.fillStyle = '#a8321e'; x.fillRect(4, 4, 40, 40);
    x.fillStyle = '#f5e6c8';
    const g = ['1111.1111', '1..1.1..1', '1111.1111', '.........', '111111111', '1...1...1', '1.11111.1', '1...1...1', '111111111'];
    drawGrid(x, g, 8, 8, 3.6, { 1: '#f5e6c8' });
  }
  function title() {
    $('title').classList.remove('hidden'); $('game').classList.add('hidden');
    $('ver').textContent = VERSION;
    $('btnLoad').disabled = !storeGet();
    $('btnTut').textContent = storeGet(TUT_KEY) ? '튜토리얼 이어하기' : '튜토리얼';
    $('pick').classList.add('hidden');
    drawSeal();
    if (!askedOnce && !storeGet(SEEN_KEY) && !storeGet()) {
      askedOnce = true;
      openModal(`<h3>삼국쟁투에 오신 것을 환영합니다</h3><div class="tutline">${faceImg()}<p>처음이시라면 참모 순욱의 안내를 받으며 5분 정도 연습 판을 해 보시겠어요? 연습 판은 지금 진행 중인 판과 따로 저장됩니다.</p></div>
        <div class="btnrow"><button class="pri" id="tutYes">예, 튜토리얼부터</button><button id="tutNo">아니요</button></div>`);
      const seen = () => storeSet('1', SEEN_KEY);
      $('tutYes').onclick = () => { if (!guard()) return; seen(); closeModal(); startTutorial(); };
      $('tutNo').onclick = () => { if (!guard()) return; seen(); closeModal(); };
    }
  }
  function showPick() {
    const box = $('factions'); box.innerHTML = '';
    const tmp = K.newGame('cao', 1);
    for (const f of D.FACTIONS) {
      const cities = Object.values(tmp.cities).filter(c => c.owner === f.id);
      const gens = Object.values(tmp.gens).filter(g => g.alive && g.faction === f.id);
      const r = tmp.gens[f.ruler];
      const b = document.createElement('button');
      b.className = 'fcard';
      b.innerHTML = `<b><span class="sw" style="background:${f.color}"></span>${esc(f.name)}</b>
        <small>도시 ${cities.length} · 장수 ${gens.length} · 병력 ${fmt(cities.reduce((a, c) => a + c.troops, 0))}<br>${esc(cities.map(c => c.name).join(', '))}<br>군주 통솔 ${r.lead} · 지력 ${r.int}</small>`;
      b.onclick = () => startGame(f.id);
      box.appendChild(b);
    }
    $('pick').classList.remove('hidden');
  }
  function startGame(fid) {
    // ?seed=숫자 를 붙이면 같은 판을 다시 열 수 있다(버그 재현·시험용)
    const qs = new URLSearchParams(location.search).get('seed');
    G = K.newGame(fid, qs ? +qs : (Date.now() % 1e6) | 0, { virtual: $('optVirtual').checked });
    sel = G.factions[fid].capital;
    enterGame();
    toast('수도는 직접 다스리고, 다른 도시는 태수에게 방침을 맡깁니다.');
  }
  function startTutorial() {
    G = K.newTutorial();
    sel = null;
    enterGame();
  }
  function loadTutorial() {
    const s = storeGet(TUT_KEY);
    if (!s) return startTutorial();
    try { G = K.load(s); } catch (e) { return startTutorial(); }
    sel = null; enterGame();
    if (G.tut && G.tut.done && !G.tut.kept) tutFinishAgain(!G.cities.xuchang || G.cities.xuchang.owner !== 'cao');
  }
  function enterGame() {
    $('title').classList.add('hidden'); $('game').classList.remove('hidden');
    persist();
    render();
  }

  // ---------- 지도 ----------
  const MAP = { w: 900, h: 720 };
  let mapT = { s: 1, ox: 0, oy: 0 };
  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { dpr, w: r.width, h: r.height };
  }
  function drawMap() {
    const cv = $('map'); if (!G || !cv.offsetParent) return;
    const { dpr, w, h } = sizeCanvas(cv);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a241c'; ctx.fillRect(0, 0, w, h);
    const pad = 14;
    // 도시 창이 가리는 부분을 빼고 남은 곳에 지도를 맞춘다
    let aw = w, ah = h;
    const pn = $('panel');
    if (!pn.classList.contains('hidden')) {
      const pr = pn.getBoundingClientRect(), mr = cv.getBoundingClientRect();
      if (pr.left > mr.left + 40) aw = pr.left - mr.left; else ah = Math.max(160, pr.top - mr.top);
    }
    let top = 0;
    const tb = $('tut');
    if (!tb.classList.contains('hidden') && !tutWide()) top = tb.offsetHeight + 8;
    ah -= top;
    const s = Math.min((aw - pad * 2) / MAP.w, (ah - pad * 2) / MAP.h);
    mapT = { s, ox: (aw - MAP.w * s) / 2, oy: top + Math.max(pad, (ah - MAP.h * s) / 2) };
    const P = (x, y) => [mapT.ox + x * s, mapT.oy + y * s];
    // 바탕
    ctx.fillStyle = '#d9c9a3';
    ctx.fillRect(mapT.ox - 8, mapT.oy - 8, MAP.w * s + 16, MAP.h * s + 16);
    ctx.strokeStyle = '#8a7656'; ctx.lineWidth = 2; ctx.strokeRect(mapT.ox - 8, mapT.oy - 8, MAP.w * s + 16, MAP.h * s + 16);
    // 강(대략): 황하, 장강
    const river = (pts, wd) => { ctx.strokeStyle = '#7fa3b8'; ctx.lineWidth = wd * s; ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
    river([[60, 120], [180, 90], [300, 200], [330, 270], [420, 255], [520, 235], [600, 200], [700, 170], [780, 150], [880, 130]], 6);
    river([[150, 560], [260, 590], [380, 600], [470, 610], [560, 590], [660, 560], [760, 520], [880, 470]], 8);
    // 산 무늬
    ctx.fillStyle = '#b7a37c';
    for (const [mx, my] of [[150, 260], [180, 300], [340, 380], [370, 420], [320, 470], [520, 40], [560, 70]]) {
      const [x, y] = P(mx, my); ctx.beginPath(); ctx.moveTo(x - 10 * s, y + 6 * s); ctx.lineTo(x, y - 8 * s); ctx.lineTo(x + 10 * s, y + 6 * s); ctx.fill();
    }
    // 길
    ctx.setLineDash([6 * s, 5 * s]); ctx.lineWidth = Math.max(1, 2 * s); ctx.strokeStyle = '#8a7656';
    for (const c of Object.values(G.cities)) for (const n of c.adj) if (c.id < n) {
      const o = G.cities[n]; const [x1, y1] = P(c.x, c.y), [x2, y2] = P(o.x, o.y);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);
    // 포위 화살표
    for (const sg of G.sieges) {
      const a = G.cities[sg.from], b = G.cities[sg.to];
      const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
      ctx.strokeStyle = fcolor(sg.att); ctx.lineWidth = Math.max(2, 5 * s);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * 0.82, y1 + (y2 - y1) * 0.82); ctx.stroke();
    }
    // 수송 행렬: 지금 칸과 다음 칸 사이에 작은 깃발
    for (const v of G.convoys || []) {
      const a = G.cities[v.path[v.at]], b = G.cities[v.path[Math.min(v.at + 1, v.path.length - 1)]];
      const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
      const x = x1 + (x2 - x1) * 0.5, y = y1 + (y2 - y1) * 0.5;
      const k = Math.max(1.5, 2.6 * s * 1.2);
      ctx.fillStyle = '#3d3326'; ctx.fillRect(x - k * 0.5, y - k * 6, k, k * 7);
      ctx.fillStyle = fcolor(v.owner); ctx.fillRect(x + k * 0.5, y - k * 6, k * 4, k * 3);
      ctx.strokeStyle = '#1b1712'; ctx.lineWidth = 1; ctx.strokeRect(x + k * 0.5, y - k * 6, k * 4, k * 3);
    }
    // 도시
    const px = Math.max(2, Math.round(4 * s * 1.2));
    const hegemon = G.coalition ? G.coalition.target : null;
    ctx.textAlign = 'center';
    for (const c of Object.values(G.cities)) {
      const [x, y] = P(c.x, c.y);
      const col = fcolor(c.owner);
      if (sel === c.id) { ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.arc(x, y, px * 8, 0, Math.PI * 2); ctx.fill(); }
      if (tutTargetCity() === c.id) {
        const a = 0.75 + 0.25 * Math.sin(performance.now() / 260);
        ctx.strokeStyle = `rgba(242, 160, 20, ${a})`; ctx.lineWidth = Math.max(4, px * 1.6);
        ctx.beginPath(); ctx.arc(x, y, px * 9.5, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 245, 200, ${a * 0.8})`; ctx.lineWidth = Math.max(1.5, px * 0.5);
        ctx.beginPath(); ctx.arc(x, y, px * 9.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (hegemon && c.owner === hegemon) {
        ctx.strokeStyle = '#c0281b'; ctx.lineWidth = Math.max(2, px * 0.8);
        ctx.strokeRect(x - px * 6.2, y - px * 5.7, px * 12.4, px * 9.4);
      }
      drawGrid(ctx, CASTLE, x - px * 5.5, y - px * 5, px, { 1: shade(col, 0.45), 2: '#e9dfc8', 3: col, 0: '#1b1712' });
      const fs = Math.max(11, Math.round(15 * s * 1.1));
      ctx.font = `700 ${fs}px "Noto Serif KR", serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = '#efe4cc'; ctx.fillStyle = '#1b1712';
      ctx.strokeText(c.name, x, y + px * 4 + fs); ctx.fillText(c.name, x, y + px * 4 + fs);
      ctx.font = `${Math.max(10, fs - 3)}px sans-serif`;
      const sub = (c.owner === G.playerFaction ? '' : (c.owner ? G.factions[c.owner].name + ' ' : '공백 ')) + fmt(c.troops / 1000) + '천';
      ctx.strokeText(sub, x, y + px * 4 + fs * 2); ctx.fillStyle = '#3d3326'; ctx.fillText(sub, x, y + px * 4 + fs * 2);
      if (G.sieges.some(sg => sg.to === c.id)) { ctx.font = `${fs + 4}px sans-serif`; ctx.fillText('⚔', x + px * 6, y - px * 4); }
    }
  }
  function cityAt(cx, cy) {
    let best = null, bd = 1e9;
    for (const c of Object.values(G.cities)) {
      const x = mapT.ox + c.x * mapT.s, y = mapT.oy + c.y * mapT.s;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = c; }
    }
    return bd < Math.max(34, 50 * mapT.s) ? best : null;
  }

  // ---------- 그리기 전체 ----------
  function render() {
    if (!G) return;
    const pf = G.factions[G.playerFaction];
    $('date').textContent = `${G.year}년 ${G.month}월`;
    $('fname').textContent = pf ? pf.name : '';
    const mine = K.citiesOf(G, G.playerFaction);
    $('res').textContent = `도시 ${mine.length} · 금 ${fmt(mine.reduce((a, c) => a + c.gold, 0))} · 식량 ${fmt(mine.reduce((a, c) => a + c.food, 0))} · 병력 ${fmt(mine.reduce((a, c) => a + c.troops, 0) + G.sieges.filter(s => s.att === G.playerFaction).reduce((a, s) => a + K.armyTroops(s), 0) + convoyTroops(G.playerFaction))}`;
    $('tutBadge').classList.toggle('hidden', !(G.tut && G.tut.protect));
    const k = G.coalition, cb = $('coalBadge');
    cb.classList.toggle('hidden', !k);
    if (k) {
      const me = G.playerFaction;
      const role = k.target === me ? '표적: 우리' : k.members.includes(me) ? '우리도 참가' : k.left.includes(me) ? '우리는 이탈' : '';
      // 휴대폰에서는 짧게(우리 역할을 한 글자 표시로)
      const short = k.target === me ? ' ⚠' : k.members.includes(me) ? ' ✓' : '';
      cb.textContent = `반${G.factions[k.target].name} 연합${role ? (window.innerWidth >= 560 ? ' · ' + role : short) : ''}`;
      cb.title = role;
    }
    renderPanel();
    renderSieges();
    renderTut();
    drawMap();
    // 미리 해 둔 일(징병 지정, 출진 등)이 있으면 단계를 바로 넘긴다
    if (inTut() && K.tutCheck(G, { type: 'tick' })) { persist(); if (G.tut.done) tutFinish(false); else render(); }
  }

  function renderSieges() {
    const box = $('sieges'); box.innerHTML = '';
    for (const s of G.sieges.filter(s => s.att === G.playerFaction && !s.auto)) {
      const c = G.cities[s.to];
      const odds = K.assaultOdds(G, s, 12);
      const d = document.createElement('div');
      d.className = 'scard';
      const ord = { hold: '포위 유지', assault: '공격', sabotage: '파괴공작', retreat: '철수' }[s.order];
      d.innerHTML = `<b>${esc(c.name)} 포위</b> ${s.turns}턴째 · 아군 ${fmt(K.armyTroops(s))}<br>
        성벽 ${fmt(c.wall)}/${fmt(c.wallMax)} (수성 시설 ${K.towersFor(c.wallMax)}, 위력 ${Math.round(K.towerPower(c.wall, c.wallMax) * 100)}%) · 수비 사기 ${s.defMorale} · 식량 ${fmt(c.food)}<br>
        지금 치면 예상 승률 <b>${Math.round(odds * 100)}%</b> · 이번 턴: <b>${ord}</b>
        <div class="row"></div>`;
      const row = d.querySelector('.row');
      for (const [o, t] of [['assault', '공격'], ['sabotage', '공작'], ['hold', '유지'], ['retreat', '철수']]) {
        const b = document.createElement('button'); b.className = 'sm' + (s.order === o ? ' pri' : ''); b.textContent = t; b.dataset.o = o;
        b.onclick = () => { K.siegeOrder(G, s.id, o); renderSieges(); renderTut(); };
        row.appendChild(b);
      }
      box.appendChild(d);
    }
  }

  // ---------- 도시 창 ----------
  const POLICY = { auto: '알아서(태수 판단)', dev: '개발', mil: '징병·훈련', def: '방어', atk: '공략', sup: '전선 지원(병력 보내기)' };
  function aptTxt(g) { return ['inf', 'arc', 'cav'].map(t => `${D.UNIT[t].name[0]}<span class="apt ${g.apt[t]}">${g.apt[t]}</span>`).join(' '); }
  function renderPanel() {
    const p = $('panel');
    $('game').classList.toggle('panel-open', !!sel);
    if (!sel) { p.classList.add('hidden'); return; }
    const c = G.cities[sel];
    const own = c.owner === G.playerFaction;
    const st = (label, v, max) => `<div>${label}<b>${fmt(v)}</b>${max ? `<div class="bar"><i style="width:${Math.min(100, 100 * v / max)}%"></i></div>` : ''}</div>`;
    let h = `<div class="hd"><h3>${esc(c.name)}</h3><span class="tag">${esc(D.REGIONS[c.region].name)}</span>
      <span class="tag" style="border-color:${fcolor(c.owner)}">${c.owner ? esc(G.factions[c.owner].name) : '공백'}</span>
      ${own ? `<span class="tag">${c.direct ? '직할' : '위임'}</span>` : ''}<button class="sm close" data-act="close">닫기</button></div>`;
    h += `<div class="stats">${st('인구', c.pop)}${st('병력', c.troops)}${st('부상병', c.wounded)}${st('민심', c.loyalty, 100)}
      ${st('농업', c.agri, c.agriMax)}${st('상업', c.comm, c.commMax)}${st('성벽', c.wall, c.wallMax)}${st('훈련', c.train, 100)}
      ${own ? st('금', c.gold) + st('식량', c.food) : ''}</div>`;
    const offs = K.gensIn(G, c.id).filter(g => g.faction && g.faction === c.owner && !g.army);
    const ronin = K.roninIn(G, c.id);
    if (own) {
      h += `<div class="btnrow"><button class="sm" data-act="direct">${c.direct ? '태수에게 맡기기' : '직접 다스리기'}</button>
        <button class="sm" data-act="send" ${sendTargets(c).length ? '' : 'disabled'}>병력 보내기</button>
        <button class="sm pri" data-act="attack" ${attackTargets(c).length && offs.length ? '' : 'disabled'}>출진</button></div>`;
      if (!c.direct) {
        h += `<div class="sec"><h4>태수 방침</h4><select data-act="policy">${Object.entries(POLICY).map(([k, v]) => `<option value="${k}" ${c.policy === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${c.policy === 'atk' ? `<select data-act="target">${['<option value="">목표 선택</option>'].concat(attackTargets(c).map(o => `<option value="${o.id}" ${c.target === o.id ? 'selected' : ''}>${esc(o.name)}</option>`)).join('')}</select>` : ''}
          <p class="hint">태수는 방침에 맞게 장수들에게 일을 나눕니다. 공략 방침은 우세할 때 스스로 출진하고, 전선 지원 방침은 3턴마다 남는 병력의 절반을 가장 위험한 전선으로 보냅니다. 적 세력도 같은 규칙으로 움직입니다.</p></div>`;
      }
      h += `<div class="sec"><h4>장수 ${offs.length}명 ${c.direct ? '— 할 일을 고르세요(계속 유지됩니다)' : ''}</h4>`;
      for (const g of offs) {
        h += `<div class="gen"><span class="nm">${esc(g.name)}${G.factions[c.owner].ruler === g.id ? ' 👑' : ''}${g.virtual ? ' <small class="tag">가상</small>' : ''}</span>`;
        if (c.direct) h += taskSelect(g, c);
        else h += `<span class="tag">${K.TASKS[g.task] || '대기'}</span>`;
        h += `<span class="st">통${g.lead} 무${g.war} 지${g.int} 정${g.pol} · ${aptTxt(g)} · ${G.year - g.birth}세</span></div>`;
      }
      h += `</div>`;
    } else {
      h += `<div class="sec"><h4>장수 ${offs.length}명</h4>${offs.map(g => `<div class="gen"><span class="nm">${esc(g.name)}</span><span></span><span class="st">통${g.lead} 무${g.war} 지${g.int} · ${aptTxt(g)}</span></div>`).join('') || '<p class="hint">수비 장수가 없습니다(향병만 지킴).</p>'}</div>`;
      const from = c.adj.map(id => G.cities[id]).filter(o => o.owner === G.playerFaction);
      if (from.length) h += `<div class="btnrow"><button class="sm pri" data-act="attackFrom">이 도시로 출진</button></div>`;
    }
    if (ronin.length) h += `<div class="sec"><h4>재야 인재</h4>${ronin.map(g => `<div class="gen"><span class="nm">${esc(g.name)}${g.virtual ? ' <small class="tag">가상</small>' : ''}</span><span></span><span class="st">통${g.lead} 무${g.war} 지${g.int} 정${g.pol} · ${aptTxt(g)}</span></div>`).join('')}${own ? '<p class="hint">직할 도시라면 장수의 할 일을 「등용」으로 바꾸세요. 위임 도시는 태수가 알아서 등용을 시도합니다.</p>' : ''}</div>`;
    p.innerHTML = h;
    p.classList.remove('hidden');
    p.onclick = onPanel; p.onchange = onPanel;
  }
  function attackTargets(c) { return c.adj.map(id => G.cities[id]).filter(o => o.owner !== c.owner && !G.sieges.some(s => s.to === o.id && s.att === c.owner)); }
  function taskSelect(g, c) {
    const opts = ['agri', 'comm', 'wall', 'recruit', 'train', 'search', 'rest'];
    let h = `<select data-gen="${g.id}" data-act="task">`;
    for (const t of opts) {
      if (t === 'search' && !G.opts.virtual) continue;
      let label = K.TASKS[t];
      if (t === 'recruit') label += ` (+${fmt(K.recruitAmount(c, g))})`;
      h += `<option value="${t}" ${g.task === t ? 'selected' : ''}>${label}</option>`;
    }
    for (const r of K.roninIn(G, c.id)) h += `<option value="hire:${r.id}" ${g.task === 'hire' && g.arg === r.id ? 'selected' : ''}>등용: ${esc(r.name)}</option>`;
    for (const o of c.adj.map(id => G.cities[id]).filter(o => o.owner && o.owner !== c.owner)) h += `<option value="sabotage:${o.id}" ${g.task === 'sabotage' && g.arg === o.id ? 'selected' : ''}>파괴공작: ${esc(o.name)}</option>`;
    for (const o of K.citiesOf(G, c.owner).filter(o => o.id !== c.id)) h += `<option value="move:${o.id}" ${g.task === 'move' && g.arg === o.id ? 'selected' : ''}>이동: ${esc(o.name)}</option>`;
    return h + '</select>';
  }
  function onPanel(e) {
    const t = e.target, act = t.dataset && t.dataset.act;
    if (!act) return;
    const c = G.cities[sel];
    if (e.type === 'click' && t.tagName === 'SELECT') return;
    if (act === 'close') { sel = null; render(); }
    else if (act === 'direct') { c.direct = !c.direct; render(); }
    else if (act === 'policy' && e.type === 'change') { c.policy = t.value; if (c.policy !== 'atk') c.target = null; render(); }
    else if (act === 'target' && e.type === 'change') { c.target = t.value || null; render(); }
    else if (act === 'task' && e.type === 'change') { const [task, arg] = t.value.split(':'); K.setTask(G, t.dataset.gen, task, arg); persist(); if (!tutEvent({ type: 'task', gen: t.dataset.gen, task })) renderPanel(); }
    else if (act === 'attack') openAttack(c.id, null);
    else if (act === 'send') openSend(c.id);
    else if (act === 'attackFrom') openAttack(c.adj.map(id => G.cities[id]).filter(o => o.owner === G.playerFaction).sort((a, b) => b.troops - a.troops)[0].id, c.id);
  }

  const convoyTroops = fid => (G.convoys || []).filter(v => v.owner === fid).reduce((a, v) => a + v.troops, 0);

  // ---------- 출진 ----------
  function openAttack(fromId, toId) {
    const c = G.cities[fromId];
    const targets = attackTargets(c);
    if (!targets.length) return;
    const offs = K.officersIn(G, fromId).sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
    let to = toId && targets.find(o => o.id === toId) ? toId : (inTut() && targets.some(o => o.id === 'xuchang') ? 'xuchang' : targets[0].id);
    const def = K.defaultArmy(G, fromId);
    const rows = offs.map(g => { const d = def.find(u => u.gen === g.id); return { g, on: !!d, type: d ? d.type : K.bestType(g), troops: d ? d.troops : 0 }; });
    const fill = () => {
      const on = rows.filter(r => r.on);
      const pool = Math.floor(c.troops * 0.6);
      const cap = on.reduce((a, r) => a + K.unitCap(r.g), 0) || 1;
      for (const r of rows) r.troops = r.on ? Math.max(100, Math.min(K.unitCap(r.g), Math.floor(pool * K.unitCap(r.g) / cap / 100) * 100)) : 0;
    };
    let tactic = 'normal';
    const draw = () => {
      const tot = rows.reduce((a, r) => a + (r.on ? r.troops : 0), 0);
      const tgt = G.cities[to];
      const leaving = G.coalition && G.coalition.members.includes(G.playerFaction) && G.coalition.members.includes(G.cities[to].owner);
      let h = `<h3>${esc(c.name)}에서 출진</h3>${leaving ? `<p class="hint" style="color:#a8321e"><b>주의:</b> ${esc(K.J(G.factions[G.cities[to].owner].name, '은', '는'))} 우리와 같은 연합입니다. 출진하면 우리는 연합에서 빠지고, 이 연합이 끝날 때까지 다시 들어갈 수 없습니다.</p>` : ''}${inTut() ? tutTip(to === 'xuchang' ? '기본으로 채워진 편성 그대로 「출진」을 누르시면 됩니다.' : '목표를 허창으로 바꾸시지요.') : ''}
        <p>목표 <select id="atkTo">${targets.map(o => `<option value="${o.id}" ${o.id === to ? 'selected' : ''}>${esc(o.name)} (${o.owner ? esc(G.factions[o.owner].name) : '공백'}, 병력 ${fmt(o.troops)}, 성벽 ${fmt(o.wall)})</option>`).join('')}</select></p>
        <p class="hint">첫 부대가 총대장입니다. 총대장 부대가 무너지면 나머지 부대 사기가 30 떨어집니다(즉시 패배는 아님). 출진하면 곧바로 성을 포위하고, 다음 턴부터 공격·파괴공작을 고를 수 있습니다. 기병은 사다리를 못 타지만 성문이 깨지면 성 안으로 돌입합니다.</p>`;
      rows.forEach((r, i) => {
        h += `<div class="urow"><label><input type="checkbox" data-i="${i}" data-k="on" ${r.on ? 'checked' : ''}> <b>${esc(r.g.name)}</b></label>
          <span class="hint">통${r.g.lead} 무${r.g.war} · ${aptTxt(r.g)} · 최대 ${fmt(K.unitCap(r.g))}</span>
          ${r.on ? `<div class="ctl"><select data-i="${i}" data-k="type">${['inf', 'arc', 'cav'].map(t => `<option value="${t}" ${r.type === t ? 'selected' : ''}>${D.UNIT[t].name} (${r.g.apt[t]})</option>`).join('')}</select>
          <input type="range" min="100" max="${Math.min(K.unitCap(r.g), c.troops)}" step="100" value="${r.troops}" data-i="${i}" data-k="troops"><b>${fmt(r.troops)}</b></div>` : ''}</div>`;
      });
      const on = rows.filter(r => r.on).length;
      h += `<p>작전 <select id="atkTac"><option value="normal" ${tactic === 'normal' ? 'selected' : ''}>균형</option><option value="charge" ${tactic === 'charge' ? 'selected' : ''}>돌격(주는 피해·받는 피해 +10%)</option><option value="careful" ${tactic === 'careful' ? 'selected' : ''}>신중(둘 다 −10%)</option></select></p>
        <p>출진 병력 <b>${fmt(tot)}</b> / 도시 병력 ${fmt(c.troops)} · 남는 수비 <b>${fmt(Math.max(0, c.troops - tot))}</b> ${tot > c.troops ? '<b style="color:#a8321e">— 병력이 모자랍니다</b>' : ''} ${on > 4 ? '<b style="color:#a8321e">— 부대는 4개까지</b>' : ''}</p>
        <div class="btnrow"><button class="pri" id="atkGo" ${!on || on > 4 || tot > c.troops ? 'disabled' : ''}>출진</button><button id="atkNo">취소</button></div>`;
      openModal(h);
      $('atkTo').onchange = e => { to = e.target.value; draw(); };
      $('atkTac').onchange = e => { tactic = e.target.value; };
      $('modalBox').oninput = e => { const i = e.target.dataset.i; if (i == null) return; if (e.target.dataset.k === 'troops') { rows[i].troops = +e.target.value; e.target.nextElementSibling.textContent = fmt(rows[i].troops); } };
      $('modalBox').onchange = e => {
        const i = e.target.dataset.i; if (i == null) return;
        const k = e.target.dataset.k;
        if (k === 'on') { rows[i].on = e.target.checked; fill(); draw(); }
        else if (k === 'type') rows[i].type = e.target.value;
        else if (k === 'troops') draw();
      };
      $('atkNo').onclick = closeModal;
      $('atkGo').onclick = () => {
        if (!guard()) return;
        const units = rows.filter(r => r.on).map(r => ({ gen: r.g.id, type: r.type, troops: r.troops }));
        const s = K.launchAttack(G, fromId, to, units, tactic);
        if (!s) { toast('출진할 수 없습니다. 병력과 장수를 확인하세요.'); return; }
        closeModal(); sel = tutWide() ? to : null; persist(); render(); tutEvent({ type: 'march' });
        toast(`${K.J(G.cities[to].name, '을', '를')} 포위했습니다. 다음 턴부터 공격·파괴공작을 고를 수 있습니다.`);
      };
    };
    draw();
  }

  // ---------- 병력 보내기 ----------
  function sendTargets(c) { return K.citiesOf(G, c.owner).filter(o => o.id !== c.id && K.ownPath(G, c.id, o.id)); }
  function openSend(fromId) {
    const c = G.cities[fromId];
    const tg = sendTargets(c);
    if (!tg.length) return;
    const max = Math.max(0, c.troops - 3000);
    let to = tg[0].id, n = Math.min(max, Math.max(500, Math.floor(max / 2 / 100) * 100));
    const draw = () => {
      const hops = K.ownPath(G, fromId, to).length - 1;
      const food = Math.round(hops * n * 0.02);
      const ok = max >= 500 && n >= 500 && n <= max && c.food >= food && !G.sieges.some(s => s.to === fromId);
      openModal(`<h3>${esc(c.name)}에서 병력 보내기</h3>
        <p>목적지 <select id="sendTo">${tg.map(o => `<option value="${o.id}" ${o.id === to ? 'selected' : ''}>${esc(o.name)} (병력 ${fmt(o.troops)}, ${K.ownPath(G, fromId, o.id).length - 1}턴)</option>`).join('')}</select></p>
        <p>보낼 병력 <input type="range" id="sendN" min="500" max="${Math.max(500, max)}" step="100" value="${n}" ${max < 500 ? 'disabled' : ''}> <b id="sendNv">${fmt(n)}</b></p>
        <p class="hint">장수 없이 병사만 갑니다. 아군 성만 지나 한 칸에 한 턴씩 걸리고, 칸마다 보내는 병력의 2%만큼 식량이 듭니다. 이 성에는 최소 3,000명을 남겨야 하며, 가는 길이 끊기면 가장 가까운 아군 성으로 돌아갑니다.</p>
        <p>걸리는 시간 <b>${hops}턴</b> · 드는 식량 <b>${fmt(food)}</b> (보유 ${fmt(c.food)}) · 남는 병력 <b>${fmt(c.troops - n)}</b>
          ${max < 500 ? '<br><b style="color:#a8321e">보낼 수 있는 병력이 없습니다(최소 3,000명은 남겨야 함)</b>' : ''}${c.food < food ? '<br><b style="color:#a8321e">식량이 모자랍니다</b>' : ''}${G.sieges.some(s => s.to === fromId) ? '<br><b style="color:#a8321e">포위당한 성에서는 보낼 수 없습니다</b>' : ''}</p>
        <div class="btnrow"><button class="pri" id="sendGo" ${ok ? '' : 'disabled'}>보내기</button><button id="sendNo">취소</button></div>`);
      $('sendTo').onchange = e => { to = e.target.value; draw(); };
      const r = $('sendN');
      r.oninput = () => { n = +r.value; $('sendNv').textContent = fmt(n); };
      r.onchange = () => { n = +r.value; draw(); };
      $('sendNo').onclick = closeModal;
      $('sendGo').onclick = () => {
        if (!guard()) return;
        const v = K.sendTroops(G, fromId, to, n);
        if (!v) { toast('보낼 수 없습니다. 병력·식량·길을 확인하세요.'); return; }
        closeModal(); persist(); render();
        toast(`${fmt(n)}명이 ${K.J(G.cities[to].name, '으로', '로')} 출발했습니다(${hops}턴 뒤 도착).`);
      };
    };
    draw();
  }

  // ---------- 턴 종료 ----------
  async function endTurn() {
    if (busy || !G || G.over) return;
    if (!K.tutCanEndTurn(G)) { shakeTut(); return; }
    busy = true; $('btnEnd').disabled = true;
    const mark = G.log[G.log.length - 1];
    K.endTurn(G);
    persist();
    render();
    for (const rp of G.replays.slice()) {
      await showBattle(rp);
      if (inTut() && rp.title.includes(G.cities.xuchang.name)) tutEvent({ type: 'battle', city: 'xuchang', won: G.cities.xuchang.owner === 'cao' });
    }
    const idx = G.log.indexOf(mark);
    const list = G.log.slice(idx + 1);
    showReport(list);
    busy = false; render();
  }
  function showReport(list) {
    const imp = list.filter(x => x.kind !== 'info' || /재야|장성|세상/.test(x.text));
    const rest = list.length - imp.length;
    let h = `<h3>${G.year}년 ${G.month}월 보고</h3>${inTut() ? tutTip('보고서에는 이번 달에 일어난 일이 모입니다. 「확인」을 누르시지요.') : ''}<div class="log">${imp.map(x => `<p class="${x.kind}">${esc(x.text)}</p>`).join('') || '<p>큰 일은 없었습니다.</p>'}</div>`;
    if (rest > 0) h += `<p class="hint">다른 세력 소식 ${rest}건은 메뉴 → 전체 기록에서 볼 수 있습니다.</p>`;
    if (G.over) h += `<h3 style="margin-top:12px">${G.over === 'win' ? '천하 통일!' : '패배'}</h3>`;
    h += `<div class="btnrow"><button class="pri" id="repOk">${G.over ? '처음 화면으로' : '확인'}</button></div>`;
    openModal(h);
    $('repOk').onclick = () => { if (!guard()) return; closeModal(); if (G.over) { title(); return; } if (!tutEvent({ type: 'turn' })) render(); };
  }

  // ---------- 전투 관전 ----------
  function showBattle(rp) {
    return new Promise(resolve => {
      const r = rp.result;
      const meta = r.meta;
      const attName = G.factions[rp.att] ? G.factions[rp.att].name : '?';
      const defName = rp.def && G.factions[rp.def] ? G.factions[rp.def].name : '향병';
      openModal(`<h3>${esc(rp.title)}</h3><div class="bhud"><span style="color:${fcolor(rp.att)}">■</span><b>${esc(attName)}</b> 공격 <span id="bRound"></span> 수비 <b>${esc(defName)}</b><span style="color:${fcolor(rp.def)}">■</span></div>
        <canvas id="bcanvas"></canvas><div class="bhud" id="bInfo"></div>
        <div class="btnrow"><button id="bFast">2배속</button><button id="bSkip" class="pri">결과 보기</button></div>`);
      const cv = $('bcanvas');
      const CELL = 24, BW = K.W * CELL, BH = K.H * CELL;
      cv.width = BW * 2; cv.height = BH * 2; cv.style.aspectRatio = BW + '/' + BH;
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.setTransform(2, 0, 0, 2, 0, 0);
      let fi = 0, t0 = performance.now(), speed = 1, done = false, raf = 0;
      const STEP = 520;
      const colors = [fcolor(rp.att), rp.def ? fcolor(rp.def) : '#9a9183'];
      function drawField(f, g, k) {
        ctx.fillStyle = r.siege ? '#7d8a55' : '#6d7f4a'; ctx.fillRect(0, 0, BW, BH);
        ctx.fillStyle = '#00000014';
        for (let x = 0; x < K.W; x++) for (let y = 0; y < K.H; y++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        if (r.siege) {
          ctx.fillStyle = '#a89a80'; ctx.fillRect((K.WALL_X + 1) * CELL, 0, (K.W - K.WALL_X - 1) * CELL, BH);
          for (let y = 0; y < K.H; y++) {
            if (y === K.GATE_Y) {
              ctx.fillStyle = g.gate > 0 ? '#5a3a1e' : '#2a1d10';
              ctx.fillRect(K.WALL_X * CELL + 3, y * CELL, CELL - 6, CELL);
              if (g.gate > 0) { ctx.fillStyle = '#c9452c'; ctx.fillRect(K.WALL_X * CELL + 2, y * CELL + CELL - 4, (CELL - 4) * g.gate, 3); }
              continue;
            }
            ctx.fillStyle = '#8d8270'; ctx.fillRect(K.WALL_X * CELL, y * CELL, CELL, CELL);
            ctx.fillStyle = '#6b604f'; ctx.fillRect(K.WALL_X * CELL, y * CELL, CELL, 3); ctx.fillRect(K.WALL_X * CELL + CELL / 2, y * CELL + CELL / 2, 1, CELL / 2);
          }
          const tw = [0, 7, 1, 6].slice(0, r.towers);
          for (const y of tw) { ctx.fillStyle = '#4a3f33'; ctx.fillRect((K.WALL_X + 1) * CELL + 4, y * CELL + 3, CELL - 8, CELL - 6); ctx.fillStyle = '#d6a53b'; ctx.fillRect((K.WALL_X + 1) * CELL + 9, y * CELL + 7, 6, 4); }
        }
        // 효과
        for (const fx of (g.fx || [])) {
          if (fx.k === 'hit') {
            ctx.strokeStyle = fx.label === 'arc' ? '#f5e6c8cc' : fx.label === 'tower' ? '#ffcf4acc' : '#ff6a4acc'; ctx.lineWidth = fx.label === 'arc' || fx.label === 'tower' ? 1 : 2;
            ctx.beginPath(); ctx.moveTo(fx.from[0] * CELL + CELL / 2, fx.from[1] * CELL + CELL / 2); ctx.lineTo(fx.to[0] * CELL + CELL / 2, fx.to[1] * CELL + CELL / 2); ctx.stroke();
          } else if (fx.k === 'gatebreak') { ctx.fillStyle = '#ffcf4a'; ctx.font = '700 12px sans-serif'; ctx.fillText('성문 돌파!', K.WALL_X * CELL - 20, K.GATE_Y * CELL - 4); }
        }
        g.u.forEach((u, i) => {
          if (u[3]) return;
          const prev = f.u[i];
          const x = (prev[0] + (u[0] - prev[0]) * k) * CELL, y = (prev[1] + (u[1] - prev[1]) * k) * CELL;
          const m = meta[i];
          const col = colors[m.side];
          drawGrid(ctx, SOLDIER[m.type], x + 4, y + 2, 2.2, { 1: shade(col, 0.5), 2: col, 3: shade(col, 0.6), 4: '#c8b48a', 5: '#7a5a30', 6: '#6b4a2b' });
          if (u[4] === 1) { ctx.fillStyle = '#c8a46a'; ctx.fillRect(x + CELL - 4, y + 2, 2, CELL - 4); }
          ctx.fillStyle = '#000a'; ctx.fillRect(x + 1, y + CELL - 4, CELL - 2, 3);
          ctx.fillStyle = m.side === 0 ? '#ffd27a' : '#9fe0ff'; ctx.fillRect(x + 1, y + CELL - 4, (CELL - 2) * u[2] / m.troops0, 3);
          if (m.commander) { ctx.fillStyle = '#ffcf4a'; ctx.fillRect(x + 1, y + 1, 4, 4); }
        });
      }
      function info(g) {
        const sum = side => g.u.reduce((a, u, i) => a + (meta[i].side === side ? u[2] : 0), 0);
        $('bRound') && ($('bRound').textContent = `${g.r}합`);
        $('bInfo').innerHTML = `<span>공격 ${fmt(sum(0))}</span><span>${r.siege ? (g.gate > 0 ? `성문 ${Math.round(g.gate * 100)}%` : '성문 열림') : '야전'}</span><span>수비 ${fmt(sum(1))}</span>`;
      }
      function loop(now) {
        if (done) return;
        const el = (now - t0) * speed;
        fi = Math.min(r.frames.length - 1, Math.floor(el / STEP) + 1);
        const k = Math.min(1, (el % STEP) / (STEP * 0.6));
        const f = r.frames[Math.max(0, fi - 1)], g = r.frames[fi];
        drawField(f, g, fi >= r.frames.length - 1 ? 1 : k);
        info(g);
        if (fi >= r.frames.length - 1 && el > r.frames.length * STEP) return finish();
        raf = requestAnimationFrame(loop);
      }
      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        const last = r.frames[r.frames.length - 1]; drawField(last, last, 1); info(last);
        const won = r.winner === 0 ? attName : defName;
        const rows = meta.map((m, i) => `<tr><td style="color:${colors[m.side]}">■</td><td>${esc(m.name)}${m.commander ? ' (총대장)' : ''}</td><td>${D.UNIT[m.type].name}</td><td>${fmt(m.troops0)} → ${fmt(last.u[i][2])}</td><td>${last.u[i][3] ? '패주' : ''}</td></tr>`).join('');
        const box = $('modalBox');
        box.querySelector('.btnrow').outerHTML = `<p><b>${esc(won)}</b> 승리 · ${r.rounds}합 · 피해 공격 ${fmt(r.losses[0])} / 수비 ${fmt(r.losses[1])}${r.gateBroken ? ' · 성문 돌파' : ''}</p>
          <table class="mini">${rows}</table><p class="hint">잃은 병력 중 이긴 쪽 40%, 진 쪽 20%는 부상병이 되어 몇 턴 뒤 돌아옵니다.</p>
          <div class="btnrow"><button class="pri" id="bOk">확인</button></div>`;
        modalAt = performance.now();
        $('bOk').onclick = () => { if (!guard()) return; closeModal(); resolve(); };
      }
      $('bFast').onclick = () => { const now = performance.now(); const el = (now - t0) * speed; speed = speed === 1 ? 2 : 1; t0 = now - el / speed; $('bFast').textContent = speed === 1 ? '2배속' : '보통 속도'; };
      $('bSkip').onclick = () => { if (!guard()) return; finish(); };
      raf = requestAnimationFrame(loop);
    });
  }

  // ---------- 메뉴 ----------
  function openMenu() {
    const f = G.factions[G.playerFaction];
    const rows = Object.values(G.factions).filter(x => x.alive).map(x => {
      const cs = K.citiesOf(G, x.id);
      return `<tr><td style="color:${x.color}">■</td><td>${esc(x.name)}</td><td>도시 ${cs.length}</td><td>병력 ${fmt(cs.reduce((a, c) => a + c.troops, 0) + convoyTroops(x.id))}</td><td>장수 ${Object.values(G.gens).filter(g => g.alive && g.faction === x.id).length}</td><td>${G.coalition ? (G.coalition.target === x.id ? '연합의 표적' : G.coalition.members.includes(x.id) ? '연합' : G.coalition.left.includes(x.id) ? '이탈' : '') : ''}</td></tr>`;
    }).join('');
    openModal(`<h3>메뉴</h3>
      <p>세율 <select id="mTax"><option value="low" ${f.tax === 'low' ? 'selected' : ''}>낮음(민심 +1/턴, 금 ×0.7)</option><option value="normal" ${f.tax === 'normal' ? 'selected' : ''}>보통</option><option value="high" ${f.tax === 'high' ? 'selected' : ''}>높음(민심 −1/턴, 금 ×1.35)</option></select></p>
      <p class="hint">3턴마다 각 도시의 남는 금 절반이 수도로 모입니다.</p>
      <table class="mini">${rows}</table>
      <div class="btnrow"><button id="mLog">전체 기록</button><button id="mSave">저장</button><button id="mTut">튜토리얼 다시 보기</button><button id="mTitle">처음 화면</button><button class="pri" id="mClose">닫기</button></div>
      <p class="hint">${VERSION} · 게임은 이 브라우저에 자동 저장됩니다.</p>`);
    $('mTax').onchange = e => { f.tax = e.target.value; persist(); render(); };
    $('mLog').onclick = () => openModal(`<h3>전체 기록</h3><div class="log">${G.log.slice().reverse().map(x => `<p class="${x.kind}">${x.y}.${x.m} ${esc(x.text)}</p>`).join('')}</div><div class="btnrow"><button class="pri" id="lgOk">닫기</button></div>`, () => { $('lgOk').onclick = closeModal; });
    $('mSave').onclick = () => { toast(persist() ? '저장했습니다.' : '저장하지 못했습니다(브라우저 저장소 막힘).'); };
    $('mTitle').onclick = () => { persist(); closeModal(); title(); };
    $('mClose').onclick = closeModal;
    $('mTut').onclick = () => {
      persist();
      if (!inTut()) { closeModal(); startTutorial(); return; }
      openModal(`<h3>연습을 처음부터 할까요?</h3><p>지금 하던 연습(${G.tut.step}/${K.TUT_STEPS.length}단계)은 사라지고 1단계부터 다시 시작합니다.</p>
        <div class="btnrow"><button class="pri" id="mTutYes">처음부터</button><button id="mTutNo">취소</button></div>`);
      $('mTutYes').onclick = () => { if (!guard()) return; closeModal(); startTutorial(); };
      $('mTutNo').onclick = () => { if (guard()) closeModal(); };
    };
  }

  // ---------- 튜토리얼 ----------
  // 순욱 얼굴(16×16 코드 도트, 새로 그림): 관모·젊은 문관·푸른 관복
  const FACE = [
    '......kkkk......',
    '.....kkkkkk.....',
    '..kkkkkkkkkkkk..',
    '....hhhhhhhh....',
    '....ssssssss....',
    '....sesssses....',
    '....ssssssss....',
    '.....sssmsss....',
    '.....ssssss.....',
    '......ssss......',
    '....wwbbbbww....',
    '...bbbwwwwbbb...',
    '..bbbbbwwbbbbb..',
    '..bbbbbbbbbbbb..',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
  ];
  const FACE_PAL = { k: '#1b1712', h: '#2a1f17', s: '#e8c39e', e: '#1b1712', m: '#a8321e', w: '#efe4cc', b: '#2f5d8a' };
  let faceURL = null;
  function faceImg() {
    if (!faceURL) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      drawGrid(c.getContext('2d'), FACE, 0, 0, 1, FACE_PAL);
      faceURL = c.toDataURL();
    }
    return `<img class="face" src="${faceURL}" alt="순욱">`;
  }
  const tutWide = () => window.innerWidth >= 900;
  const tutId = () => (inTut() ? K.TUT_STEPS[G.tut.step - 1].id : null);
  function tutTip(t) { return `<div class="tutline tip">${faceImg()}<p>${esc(t)}</p></div>`; }
  function tutTargetCity() {
    const id = tutId();
    if (id === 'openCap') return 'chenliu';
    if (id === 'delegate') return 'puyang';
    if ((id === 'march' || id === 'recruit') && sel !== 'chenliu') return 'chenliu';
    return null;
  }
  // 지금 단계에서 밝게 강조할 화면 요소
  function tutTargetEl() {
    const id = tutId();
    if (id === 'recruit') return document.querySelector(`#panel select[data-gen="${K.tutRecruiter(G)}"]`);
    if (id === 'endTurn1' || id === 'siege') return $('btnEnd');
    if (id === 'march' && sel === 'chenliu') return document.querySelector('#panel [data-act="attack"]');
    if ((id === 'assault' || id === 'siege') && sel && !tutWide()) return document.querySelector('#panel [data-act="close"]');
    if (id === 'assault') {
      const s = G.sieges.find(x => x.att === 'cao' && x.to === 'xuchang');
      return s && s.order === 'assault' ? $('btnEnd') : document.querySelector('#sieges button[data-o="assault"]');
    }
    if (['intro', 'hud', 'stats', 'victory'].includes(id)) return $('tutNext');
    return null;
  }
  function renderTut() {
    const box = $('tut');
    document.querySelectorAll('.tut-hl').forEach(el => el.classList.remove('tut-hl'));
    $('btnEnd').disabled = busy || (!!G && !K.tutCanEndTurn(G));
    if (!inTut()) { box.classList.add('hidden'); $('sieges').style.top = ''; return; }
    const st = K.TUT_STEPS[G.tut.step - 1];
    let todo = st.todo;
    if (st.id === 'assault') {
      const s = G.sieges.find(x => x.att === 'cao' && x.to === 'xuchang');
      const odds = s ? K.assaultOdds(G, s, 12) : 0;
      if (G.tut.retry) todo = '아쉽게 물러났습니다. 다시 치시지요 — ' + todo;
      if (odds < 0.9) todo = `예상 승률 ${Math.round(odds * 100)}%로는 이르니, 한 턴 더 에워싸거나 「공작」을 쓰시지요 → 「턴 종료」`;
      else if (s && s.order === 'assault') todo = '이제 위쪽 「턴 종료」를 누르세요';
    }
    if (st.id === 'march' && sel === 'chenliu') todo = '진류 창의 「출진」을 누르세요';
    if (st.id === 'recruit') {
      const who = K.tutRecruiter(G);
      if (who && who !== 'xiahoudun') todo = `하후돈 장군은 이미 출진했으니, ${G.gens[who].name}의 할 일을 「징병」으로 바꾸세요`;
      if (sel !== 'chenliu') todo = '먼저 지도에서 진류 성을 누르고, ' + todo;
    }
    if ((st.id === 'assault' || st.id === 'siege') && sel && !tutWide()) todo = '아래 도시 창을 「닫기」로 닫고 위쪽 포위 판을 보세요';
    const needNext = ['intro', 'hud', 'stats', 'victory'].includes(st.id);
    box.innerHTML = `<div class="tutline">${faceImg()}<div><p class="say">${esc(st.say)}</p><p class="todo">▶ ${esc(todo)}</p></div></div>
      <div class="tutbar"><span>${G.tut.step}/${K.TUT_STEPS.length}</span><span>
      ${needNext ? `<button class="sm pri" id="tutNext">${st.id === 'victory' ? '연습 마치기' : '다음'}</button>` : ''}
      <button class="sm" id="tutSkip">건너뛰기</button></span></div>`;
    box.classList.remove('hidden');
    if (needNext) $('tutNext').onclick = () => tutEvent({ type: 'next' });
    $('tutSkip').onclick = () => tutFinish(true);
    $('sieges').style.top = tutWide() ? '' : (box.offsetHeight + 16) + 'px';
    const el = tutTargetEl(); if (el) el.classList.add('tut-hl');
  }
  function shakeTut() {
    const b = $('tut'); if (b.classList.contains('hidden')) return;
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
  }
  // 사건을 넘기고 단계가 바뀌면 다시 그린다. 바뀌었으면 true
  function tutEvent(ev) {
    if (!inTut()) return false;
    const changed = K.tutCheck(G, ev);
    if (!changed) { if (ev.type === 'task') shakeTut(); return false; }
    persist();
    if (G.tut.done) { tutFinish(false); return true; }
    render();
    return true;
  }
  // 연습을 끝내거나 건너뛰면: 이 판을 계속하기 / 새 게임
  function tutFinish(skipped) {
    if (skipped) K.tutSkip(G); else K.tutDone(G);
    persist();
    render();
    openModal(`<h3>${skipped ? '연습을 건너뛰었습니다' : '연습을 마쳤습니다'}</h3>${tutTip(skipped ? '언제든 메뉴의 「튜토리얼 다시 보기」로 돌아오실 수 있습니다.' : '이제 휴전이 풀렸습니다. 다른 군웅들도 우리를 노릴 것이니 성을 비우지 마시지요.')}
      <div class="btnrow"><button class="pri" id="tutKeep">이 판을 계속하기</button><button id="tutNew">새 게임 시작</button></div>`);
    $('tutKeep').onclick = () => {
      if (!guard()) return;
      const keep = () => {
        G.tut.kept = true;
        if (!storeSet(K.save(G))) { G.tut.kept = false; toast('저장하지 못했습니다(브라우저 저장소가 가득 찼거나 막힘). 연습 판은 그대로 남겨 둡니다.'); return; }
        storeDel(TUT_KEY); closeModal(); render(); toast('이 판을 본 게임으로 이어 갑니다.');
      };
      if (!storeGet()) return keep();
      openModal(`<h3>진행 중인 판이 있습니다</h3><p>이어하던 본 게임 저장을 이 연습 판으로 덮어쓸까요? 덮어쓰면 예전 판은 되돌릴 수 없습니다.</p>
        <div class="btnrow"><button class="pri" id="tutOver">덮어쓰기</button><button id="tutBack">취소</button></div>`);
      $('tutOver').onclick = () => { if (guard()) keep(); };
      $('tutBack').onclick = () => { if (guard()) tutFinishAgain(skipped); };
    };
    $('tutNew').onclick = () => { if (!guard()) return; storeDel(TUT_KEY); closeModal(); G = null; title(); showPick(); };
  }
  function tutFinishAgain(skipped) { G.tut.done = true; tutFinish(skipped); }

  // ---------- 공통 ----------
  function openModal(html, after) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); modalAt = performance.now(); $('modalBox').scrollTop = 0; if (after) after(); }
  function closeModal() { $('modal').classList.add('hidden'); $('modalBox').oninput = null; $('modalBox').onchange = null; }
  function guard() { return performance.now() - modalAt > 350; } // 창이 열린 직후 잘못 누르기 방지
  function toast(t) { const d = document.createElement('div'); d.textContent = t; $('toast').appendChild(d); setTimeout(() => d.remove(), 3200); }

  // ---------- 시작 ----------
  $('btnNew').onclick = showPick;
  $('btnLoad').onclick = () => { const s = storeGet(); if (!s) return; try { G = K.load(s); sel = G.factions[G.playerFaction]?.capital || null; enterGame(); } catch (e) { toast('저장을 불러오지 못했습니다.'); } };
  $('btnEnd').onclick = endTurn;
  $('btnMenu').onclick = openMenu;
  $('map').addEventListener('click', e => {
    if (!G) return;
    const r = $('map').getBoundingClientRect();
    const c = cityAt(e.clientX - r.left, e.clientY - r.top);
    sel = c ? c.id : null;
    if (c && tutEvent({ type: 'select', city: c.id })) return;
    if (c && inTut() && ['openCap', 'delegate'].includes(tutId())) shakeTut();
    render();
  });
  window.addEventListener('resize', () => G && drawMap());
  $('btnTut').onclick = loadTutorial;
  // 지도의 금색 고리를 깜빡이게 한다(튜토리얼 대상 도시가 있을 때만)
  setInterval(() => { if (G && tutTargetCity() && !$('game').classList.contains('hidden') && $('modal').classList.contains('hidden')) drawMap(); }, 100);
  // 시험용: 도시의 화면 좌표
  const cityXY = id => { const r = $('map').getBoundingClientRect(), c = G.cities[id]; return [r.left + mapT.ox + c.x * mapT.s, r.top + mapT.oy + c.y * mapT.s]; };
  window.__gunung = { get G() { return G; }, K, endTurn, openAttack, cityXY, render: () => render() };
  title();
})();
