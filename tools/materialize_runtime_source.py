from __future__ import annotations

import io
import zipfile
from pathlib import Path

from tools.verify_runtime_archive import assemble_runtime_archive


ARCHIVE_PREFIX = "foxyya_runtime_backend/"
SOURCE_PREFIX = ARCHIVE_PREFIX + "src/"
ROOT_FILE_MAP = {
    ARCHIVE_PREFIX + "FOXYYA_V2_CONFIG.json": Path("FOXYYA_V2_CONFIG.json"),
    ARCHIVE_PREFIX + "intel_feeds.py": Path("intel_feeds.py"),
    ARCHIVE_PREFIX + "run_forward_paper.py": Path("run_forward_paper.py"),
}


def materialize_runtime_source(parts_dir: Path, repo_root: Path) -> list[Path]:
    archive_bytes = assemble_runtime_archive(parts_dir)
    written: list[Path] = []

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue

            archive_name = info.filename
            if archive_name.startswith(SOURCE_PREFIX):
                relative = Path(archive_name.removeprefix(ARCHIVE_PREFIX))
            elif archive_name in ROOT_FILE_MAP:
                relative = ROOT_FILE_MAP[archive_name]
            else:
                continue

            destination = repo_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(archive_name))
            written.append(relative)

    if not any(str(path).startswith("src/foxyya/") for path in written):
        raise RuntimeError("runtime archive contained no canonical foxyya source files")

    return sorted(written)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    for path in materialize_runtime_source(root / "backend_parts2", root):
        print(path)
