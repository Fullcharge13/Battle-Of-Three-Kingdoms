"""시험용 작은 웹 서버: dist/ 를 http://127.0.0.1:포트/ 로 띄운다.
file:// 로 열면 브라우저가 저장소를 탭마다 늦게 읽는 일이 있어, 실제 배포(https)와 같은 방식으로 시험한다."""
import functools
import http.server
import threading
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start():
    handler = functools.partial(_Quiet, directory=str(DIST))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}/index.html"
