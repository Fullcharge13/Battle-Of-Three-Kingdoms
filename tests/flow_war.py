"""v0.3 기능을 실제 브라우저(PC·휴대폰)에서 눌러 본다.
병력 보내기 → 지도 깃발 → 다음 턴 도착, 「전선 지원」 방침, 연합 표시(제목줄·지도·메뉴).
사용: python3 build.py && python3 tests/flow_war.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
import serve  # noqa: E402
URL = serve.start() + "?seed=3"
SHOTS = ROOT / "tests" / "shots"
SHOTS.mkdir(exist_ok=True)
VIEWS = {
    "pc": dict(viewport={"width": 1280, "height": 800}),
    "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True),
}


def tap_city(page, cid):
    x, y = page.evaluate(f"window.__gunung.cityXY('{cid}')")
    page.mouse.click(x, y)
    page.wait_for_timeout(250)


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth > innerWidth + 1 || document.getElementById('top').scrollWidth > document.getElementById('top').clientWidth + 1")


def close_windows(page):
    for _ in range(20):
        page.wait_for_timeout(450)
        if page.locator("#bSkip").is_visible():
            page.click("#bSkip"); page.wait_for_timeout(450); page.click("#bOk"); continue
        if page.locator("#repOk").is_visible():
            page.click("#repOk"); page.wait_for_timeout(300); return
    raise RuntimeError("창이 닫히지 않음")


def run(view, opts):
    rep = {"view": view, "errors": [], "overflow": [], "checks": {}}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(**opts)
        ctx.add_init_script("localStorage.setItem('samguk_seen', '1')")
        page = ctx.new_page()
        page.on("pageerror", lambda e: rep["errors"].append(str(e)))
        page.on("console", lambda m: m.type == "error" and rep["errors"].append(m.text))
        page.goto(URL); page.wait_for_timeout(300)
        page.click("#btnNew"); page.click(".fcard >> nth=0"); page.wait_for_timeout(300)
        # 병력 보내기
        tap_city(page, "chenliu")
        page.click('#panel [data-act="send"]'); page.wait_for_timeout(450)
        page.select_option("#sendTo", "puyang"); page.wait_for_timeout(450)
        page.screenshot(path=str(SHOTS / f"war-{view}-1-send.png"))
        if overflow(page): rep["overflow"].append("send")
        before = page.evaluate("window.__gunung.G.cities.puyang.troops")
        page.click("#sendGo"); page.wait_for_timeout(300)
        rep["checks"]["행렬 생김"] = page.evaluate("window.__gunung.G.convoys.length") == 1
        page.click('#panel [data-act="close"]'); page.wait_for_timeout(250)
        page.screenshot(path=str(SHOTS / f"war-{view}-2-flag.png"))
        page.click("#btnEnd"); close_windows(page)
        after = page.evaluate("window.__gunung.G.cities.puyang.troops")
        rep["checks"]["다음 턴 도착"] = page.evaluate("window.__gunung.G.convoys.length") == 0 and after > before
        # 전선 지원 방침
        tap_city(page, "puyang")
        page.select_option('#panel select[data-act="policy"]', "sup"); page.wait_for_timeout(250)
        rep["checks"]["전선 지원 선택"] = page.evaluate("window.__gunung.G.cities.puyang.policy") == "sup"
        page.click('#panel [data-act="close"]'); page.wait_for_timeout(250)
        # 연합(시험 판 주입: 원소에게 도시 6개)
        page.evaluate("""() => { const g = window.__gunung, G = g.G;
          for (const id of ['ye','nanpi','beiping','pingyuan','luoyang','wan']) G.cities[id].owner = 'yuan';
          g.K.updateCoalition(G); g.render(); }""")
        page.wait_for_timeout(300)
        badge = page.inner_text("#coalBadge") if page.is_visible("#coalBadge") else ""
        rep["checks"]["연합 표시"] = "반원소" in badge
        rep["badge"] = badge
        page.screenshot(path=str(SHOTS / f"war-{view}-3-coalition.png"))
        if overflow(page): rep["overflow"].append("coalition")
        page.click("#btnMenu"); page.wait_for_timeout(400)
        rep["checks"]["메뉴 연합"] = "연합의 표적" in page.inner_text("#modalBox")
        page.screenshot(path=str(SHOTS / f"war-{view}-4-menu.png"))
        if overflow(page): rep["overflow"].append("menu")
        page.click("#mClose")
        rep["ok"] = all(rep["checks"].values()) and not rep["errors"] and not rep["overflow"]
        b.close()
    return rep


if __name__ == "__main__":
    out = [run(v, o) for v, o in VIEWS.items()]
    print(json.dumps(out, ensure_ascii=False, indent=1))
    sys.exit(0 if all(r["ok"] for r in out) else 1)
