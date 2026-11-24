import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
shared = root.parent / "system-check/widget"
images = root.parent / "rakurscrm-manager/widget/images"
assets = root / "dist/public"
files = {"app.js": root / "runtime/app.js", "style.css": shared / "style.css"}
for name in ("card.js", "editor.js", "preferences.js", "editor.css", "loader-dialog.css"):
    files[name] = root / "runtime" / name
for name in ("phone.js", "installation-activation.js"):
    files["lib/" + name] = shared / "lib" / name
digest = hashlib.sha256()
for name, source in sorted(files.items()):
    digest.update(name.encode() + b"\0" + hashlib.sha256(source.read_bytes()).digest())
release = digest.hexdigest()[:16]
for name, source in files.items():
    target = assets / release / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
(assets / "release.json").write_text(json.dumps({"release": release}) + "\n")
with ZipFile(root / "dist/widget.zip", "w", ZIP_DEFLATED) as archive:
    for source in sorted((root / "widget").rglob("*")):
        if source.is_file() and not source.name.startswith("."):
            archive.write(source, source.relative_to(root / "widget"))
    for source in sorted(images.glob("*.png")):
        archive.write(source, "images/" + source.name)
print(release)
