from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
repo = root.parents[1]
widget = root / "widget"
images = repo / "integration-packages/rakurscrm-manager/widget/images"
output = root / "dist/widget.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in sorted(widget.rglob("*")):
        if path.is_file() and not path.name.startswith("."):
            archive.write(path, path.relative_to(widget))
    for path in sorted(images.glob("*.png")):
        archive.write(path, "images/" + path.name)
print(output)
