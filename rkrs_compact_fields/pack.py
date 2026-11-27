"""Build the amoMarket installation archive."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
widget = root / "widget"
archive_path = root / "dist" / "widget.zip"
archive_path.parent.mkdir(exist_ok=True)

with ZipFile(archive_path, "w", ZIP_DEFLATED) as archive:
    for path in sorted(widget.rglob("*")):
        relative = path.relative_to(widget)
        if path.is_file() and not any(part.startswith(".") for part in relative.parts):
            archive.write(path, relative.as_posix())

print(archive_path)
