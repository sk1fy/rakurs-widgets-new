import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent
widget = root / "widget"
version = json.loads((widget / "manifest.json").read_bytes())["widget"]["version"]
parser = argparse.ArgumentParser(description="Package the private rakurscrm widget for amoCRM.")
parser.add_argument("--output", type=Path, default=root / f"rakurscrm-manager-{version}.zip")
output = parser.parse_args().output
with ZipFile(output, "w") as archive:
    for path in sorted(widget.rglob("*")):
        if path.is_file() and not path.name.startswith("."):
            item = ZipInfo(path.relative_to(widget).as_posix(), (2000, 1, 1, 0, 0, 0))
            archive.writestr(item, path.read_bytes(), compress_type=ZIP_DEFLATED)
print(output)
print(hashlib.sha256(output.read_bytes()).hexdigest())
