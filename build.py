"""src/ 의 파일들을 dist/index.html 한 장으로 합친다."""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"


def build() -> Path:
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "\n".join((SRC / f).read_text(encoding="utf-8") for f in ["data.js", "core.js", "ui.js"])
    out = shell.replace("/*STYLE*/", css).replace("/*SCRIPT*/", js.replace("</script", "<\\/script"))
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    path = dist / "index.html"
    path.write_text(out, encoding="utf-8")
    return path


if __name__ == "__main__":
    p = build()
    print(f"{p} {p.stat().st_size / 1024:.1f}KB")
