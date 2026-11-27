"""Package the complete amoCRM widget."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
widget = root / "widget"
dist = root / "dist"
dist.mkdir(exist_ok=True)
origin = os.environ.get("PLATFORM_ACCESS_ORIGIN", "https://core.rkrs.ru").rstrip("/")
url = urlsplit(origin)
if url.scheme != "https" or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
    raise SystemExit("PLATFORM_ACCESS_ORIGIN must be an HTTPS origin")

with ZipFile(dist / "widget.zip", "w", ZIP_DEFLATED) as archive:
    for p in sorted(widget.rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            archive.write(p, p.relative_to(widget))
    archive.write(root.parent / "shared/account-license.js", "lib/account-license.js")
    archive.writestr("lib/deployment.js", "define([], function () { return " + json.dumps({"origin": origin}) + "; });\n")
print(dist / "widget.zip")
