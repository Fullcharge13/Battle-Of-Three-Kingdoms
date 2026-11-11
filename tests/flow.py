"""실제 브라우저(Playwright)로 PC·휴대폰 크기에서 한 판 흐름을 눌러 본다.
새 게임 → 할 일 지정 → 턴 종료 → 출진 → 포위 → 공격 → 전투 관전 → 저장·이어하기.
사용: python3 tests/flow.py   (먼저 python3 build.py)
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


def settle(page, shot_prefix, n, report):
    """보고서·전투 창을 모두 닫는다. 전투가 나오면 캡처한다."""
    for _ in range(20):
        page.wait_for_timeout(450)
        if page.locator("#bSkip").is_visible():
            page.wait_for_timeout(1300)
            page.screenshot(path=str(SHOTS / f"{shot_prefix}-battle{n}.png"))
            report["battles"] += 1
            report.setdefault("battle_titles", []).append(page.inner_text("#modalBox h3"))
            page.click("#bSkip")
            page.wait_for_timeout(450)
            page.screenshot(path=str(SHOTS / f"{shot_prefix}-battle{n}-result.png"))
            page.click("#bOk")
            continue
        if page.locator("#repOk").is_visible():
            page.click("#repOk")
            page.wait_for_timeout(200)
            return
    raise RuntimeError("창이 닫히지 않음")


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1")


def run(view, opts):
    rep = {"view": view, "errors": [], "battles": 0, "overflow": [], "steps": []}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(**opts)
        ctx.add_init_script("localStorage.setItem('samguk_seen', '1')")
        page = ctx.new_page()
        page.on("pageerror", lambda e: rep["errors"].append("pageerror: " + str(e)))
        page.on("console", lambda m: m.type == "error" and rep["errors"].append("console: " + m.text))
        page.goto(URL)
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOTS / f"{view}-1-title.png"))
        page.click("#btnNew")
        page.screenshot(path=str(SHOTS / f"{view}-2-pick.png"), full_page=True)
        page.click(".fcard >> nth=0")  # 조조
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOTS / f"{view}-3-map.png"))
        if overflow(page): rep["overflow"].append("map")
        rep["steps"].append("새 게임")
        # 직할 수도 첫 장수 할 일을 징병으로
        sel = page.locator("#panel select[data-act=task]").first
        sel.select_option("recruit")
        rep["steps"].append("할 일 지정")
        for i in range(2):
            page.click("#btnEnd")
            settle(page, view, f"t{i}", rep)
        rep["steps"].append("턴 2회")
        date1 = page.inner_text("#date")
        # 수도 다시 선택 후 출진
        page.evaluate("window.__gunung.G && 0")
        page.locator("#panel [data-act=attack]").click()
        page.wait_for_timeout(450)
        page.screenshot(path=str(SHOTS / f"{view}-4-attack.png"), full_page=True)
        if overflow(page): rep["overflow"].append("attack")
        page.select_option("#atkTo", "xuchang")
        page.wait_for_timeout(400)
        page.click("#atkGo")
        page.wait_for_timeout(300)
        n_sieges = page.evaluate("window.__gunung.G.sieges.filter(s => s.att === window.__gunung.G.playerFaction).length")
        rep["steps"].append(f"출진(포위 {n_sieges})")
        page.click("#btnEnd")
        settle(page, view, "siege", rep)
        page.screenshot(path=str(SHOTS / f"{view}-5-siege.png"))
        if page.locator(".scard").count():
            rep["steps"].append("포위 카드 표시")
            page.locator(".scard button", has_text="공격").first.click()
            page.click("#btnEnd")
            settle(page, view, "assault", rep)
            rep["steps"].append("공격 명령")
        page.screenshot(path=str(SHOTS / f"{view}-6-after.png"))
        # 메뉴
        page.click("#btnMenu")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"{view}-7-menu.png"))
        if overflow(page): rep["overflow"].append("menu")
        page.click("#mClose")
        date2 = page.inner_text("#date")
        # 이어하기
        # 같은 브라우저에서 게임을 새로 연다(새로고침과 같은 효과). 시험용 브라우저는 새로고침 직후 저장 반영이 늦을 때가 있어 새 탭을 쓴다
        page.close(); page = ctx.new_page(); page.goto(URL); page.wait_for_timeout(400)
        page.wait_for_timeout(300)
        enabled = page.is_enabled("#btnLoad")
        page.click("#btnLoad")
        page.wait_for_timeout(300)
        date3 = page.inner_text("#date")
        rep["steps"].append(f"이어하기 {'성공' if enabled and date3 == date2 else '실패'} ({date2} → {date3})")
        rep["dates"] = [date1, date2, date3]
        b.close()
    return rep


if __name__ == "__main__":
    results = [run(v, o) for v, o in VIEWS.items()]
    print(json.dumps(results, ensure_ascii=False, indent=1))
    bad = any(r["errors"] or r["overflow"] for r in results)
    sys.exit(1 if bad else 0)
