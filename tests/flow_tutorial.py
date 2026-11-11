"""튜토리얼을 실제 브라우저(PC·휴대폰)에서 끝까지 눌러 본다.
A: 첫 방문 질문 → 11단계 → 이 판을 계속하기
B: 5단계에서 새로고침 → 튜토리얼 이어하기 → 같은 단계
C: 3단계에서 건너뛰기 → 휴전 표시 사라짐, 턴 종료 눌림
사용: python3 build.py && python3 tests/flow_tutorial.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
import serve  # noqa: E402
URL = serve.start()
SHOTS = ROOT / "tests" / "shots"
SHOTS.mkdir(exist_ok=True)
VIEWS = {
    "pc": dict(viewport={"width": 1280, "height": 800}),
    "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True),
}


def step_no(page):
    t = page.inner_text("#tut .tutbar span") if page.locator("#tut:not(.hidden)").count() else ""
    return int(t.split("/")[0]) if t else 0


def tap_city(page, cid):
    x, y = page.evaluate(f"window.__gunung.cityXY('{cid}')")
    page.mouse.click(x, y)
    page.wait_for_timeout(250)


def overlap(page):
    """말풍선과 강조 대상이 겹치는지(강조 대상이 말풍선 안의 버튼이면 제외)"""
    return page.evaluate("""() => {
      const b = document.getElementById('tut'); const t = document.querySelector('.tut-hl');
      if (!t || b.classList.contains('hidden') || b.contains(t)) return false;
      const r1 = b.getBoundingClientRect(), r2 = t.getBoundingClientRect();
      return !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top);
    }""")


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")


def close_windows(page, rep):
    for _ in range(20):
        page.wait_for_timeout(450)
        if page.locator("#bSkip").is_visible():
            page.wait_for_timeout(1200)
            rep["battles"].append(page.inner_text("#modalBox h3"))
            page.click("#bSkip"); page.wait_for_timeout(450); page.click("#bOk"); continue
        if page.locator("#repOk").is_visible():
            page.click("#repOk"); page.wait_for_timeout(300); return
    raise RuntimeError("창이 닫히지 않음")


def check(page, view, rep, label):
    n = step_no(page)
    page.screenshot(path=str(SHOTS / f"tut-{view}-{label}.png"))
    if overlap(page): rep["overlap"].append(label)
    if overflow(page): rep["overflow"].append(label)
    return n


def run_full(view, opts):
    rep = {"view": view, "run": "A 완주", "errors": [], "overlap": [], "overflow": [], "battles": [], "steps": []}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(**opts); page = ctx.new_page()
        page.on("pageerror", lambda e: rep["errors"].append(str(e)))
        page.on("console", lambda m: m.type == "error" and rep["errors"].append(m.text))
        page.goto(URL); page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"tut-{view}-0-ask.png"))
        page.click("#tutYes"); page.wait_for_timeout(300)
        seen = []
        seen.append(check(page, view, rep, "1"))
        page.click("#tutNext"); seen.append(check(page, view, rep, "2"))
        page.click("#tutNext"); seen.append(check(page, view, rep, "3"))
        tap_city(page, "chenliu"); seen.append(check(page, view, rep, "4"))
        page.click("#tutNext"); seen.append(check(page, view, rep, "5"))
        page.select_option('#panel select[data-gen="xiahoudun"]', "recruit"); page.wait_for_timeout(250)
        seen.append(check(page, view, rep, "6"))
        tap_city(page, "puyang"); seen.append(check(page, view, rep, "7"))
        page.click("#btnEnd"); close_windows(page, rep); seen.append(check(page, view, rep, "8"))
        tap_city(page, "chenliu")
        page.click('#panel [data-act="attack"]'); page.wait_for_timeout(450)
        page.select_option("#atkTo", "xuchang"); page.wait_for_timeout(450)
        page.screenshot(path=str(SHOTS / f"tut-{view}-8-attack.png"))
        page.click("#atkGo"); page.wait_for_timeout(300); seen.append(check(page, view, rep, "9"))
        for _ in range(4):
            if step_no(page) != 9: break
            page.click("#btnEnd"); close_windows(page, rep)
        seen.append(check(page, view, rep, "10"))
        for _ in range(4):
            if step_no(page) != 10: break
            todo = page.inner_text("#tut .todo")
            if "이르니" in todo: page.click('#sieges button[data-o="sabotage"]')
            else: page.click('#sieges button[data-o="assault"]')
            page.wait_for_timeout(200); check(page, view, rep, "10b")
            page.click("#btnEnd"); close_windows(page, rep)
        seen.append(check(page, view, rep, "11"))
        page.click("#tutNext"); page.wait_for_timeout(450)
        page.screenshot(path=str(SHOTS / f"tut-{view}-12-finish.png"))
        page.click("#tutKeep"); page.wait_for_timeout(300)
        st = page.evaluate("({main: !!localStorage.getItem('gunung_save'), tut: !!localStorage.getItem('samguk_tut'), owner: window.__gunung.G.cities.xuchang.owner, badge: !document.getElementById('tutBadge').classList.contains('hidden')})")
        rep["steps"] = seen
        rep["end"] = st
        rep["ok"] = seen == list(range(1, 12)) and st["main"] and not st["tut"] and st["owner"] == "cao" and not st["badge"]
        b.close()
    return rep


def run_reload(view, opts):
    rep = {"view": view, "run": "B 새로고침", "errors": []}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(**opts); page = ctx.new_page()
        page.on("pageerror", lambda e: rep["errors"].append(str(e)))
        page.goto(URL); page.wait_for_timeout(300); page.click("#tutYes"); page.wait_for_timeout(300)
        page.click("#tutNext"); page.click("#tutNext"); tap_city(page, "chenliu"); page.click("#tutNext")
        before = step_no(page)
        # 같은 브라우저에서 게임을 새로 연다(새로고침과 같은 효과). 시험용 브라우저는 새로고침 직후 저장 반영이 늦을 때가 있어 새 탭을 쓴다
        page.close(); page = ctx.new_page(); page.goto(URL); page.wait_for_timeout(400)
        label = page.inner_text("#btnTut")
        page.click("#btnTut"); page.wait_for_timeout(400)
        rep.update(before=before, after=step_no(page), button=label)
        rep["ok"] = before == 5 and rep["after"] == 5 and label == "튜토리얼 이어하기"
        b.close()
    return rep


def run_skip(view, opts):
    rep = {"view": view, "run": "C 건너뛰기", "errors": []}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(**opts); page = ctx.new_page()
        page.on("pageerror", lambda e: rep["errors"].append(str(e)))
        page.goto(URL); page.wait_for_timeout(300); page.click("#tutYes"); page.wait_for_timeout(300)
        page.click("#tutNext"); page.click("#tutNext")
        locked = page.is_disabled("#btnEnd")
        page.click("#tutSkip"); page.wait_for_timeout(450); page.click("#tutKeep"); page.wait_for_timeout(300)
        badge = page.evaluate("!document.getElementById('tutBadge').classList.contains('hidden')")
        rep.update(locked_before=locked, badge_after=badge, end_enabled=page.is_enabled("#btnEnd"), bubble=page.locator("#tut:not(.hidden)").count())
        page.screenshot(path=str(SHOTS / f"tut-{view}-skip.png"))
        rep["ok"] = locked and not badge and rep["end_enabled"] and rep["bubble"] == 0
        b.close()
    return rep


def run_early(view, opts):
    """D: 시키기 전에 미리 해 둔 경우에도 막히지 않는지
    D1: 4단계에서 하후돈을 미리 징병 → 다음 → 6단계로 바로
    D2: 4단계에서 미리 출진 → 다음(5) → 남은 장수 징병(6) → 복양(7) → 턴 종료 → 9단계로 바로"""
    rep = {"view": view, "run": "D 미리 하기", "errors": []}
    with sync_playwright() as p:
        b = p.chromium.launch()
        def start():
            ctx = b.new_context(**opts); page = ctx.new_page()
            page.on("pageerror", lambda e: rep["errors"].append(str(e)))
            page.goto(URL); page.wait_for_timeout(300); page.click("#tutYes"); page.wait_for_timeout(300)
            page.click("#tutNext"); page.click("#tutNext"); tap_city(page, "chenliu")
            return page
        page = start()
        page.select_option('#panel select[data-gen="xiahoudun"]', "recruit"); page.wait_for_timeout(250)
        page.click("#tutNext"); page.wait_for_timeout(300)
        d1 = step_no(page)
        page = start()
        page.click('#panel [data-act="attack"]'); page.wait_for_timeout(450)
        page.click("#atkGo"); page.wait_for_timeout(300)
        d2 = [step_no(page)]
        page.click("#tutNext"); page.wait_for_timeout(300); d2.append(step_no(page))
        tap_city(page, "chenliu")
        who = page.evaluate("window.__gunung.K.tutRecruiter(window.__gunung.G)")
        page.screenshot(path=str(SHOTS / f"tut-{view}-early5.png"))
        page.select_option(f'#panel select[data-gen="{who}"]', "recruit"); page.wait_for_timeout(250); d2.append(step_no(page))
        tap_city(page, "puyang"); d2.append(step_no(page))
        page.click("#btnEnd"); close_windows(page, {"battles": []}); d2.append(step_no(page))
        rep.update(d1=d1, d2=d2, recruiter=who)
        rep["ok"] = d1 == 6 and d2 == [4, 5, 6, 7, 9]
        b.close()
    return rep


if __name__ == "__main__":
    out = []
    for v, o in VIEWS.items():
        out += [run_full(v, o), run_reload(v, o), run_skip(v, o), run_early(v, o)]
    print(json.dumps(out, ensure_ascii=False, indent=1))
    bad = [r for r in out if not r.get("ok") or r.get("errors") or r.get("overlap") or r.get("overflow")]
    sys.exit(1 if bad else 0)
