from __future__ import annotations

import base64
import hashlib
import io
import zipfile
from pathlib import Path


def assemble_runtime_archive(parts_dir: Path) -> bytes:
    parts = sorted(parts_dir.glob("part*"))
    if not parts:
        raise ValueError(f"no runtime archive parts found in {parts_dir}")
    encoded = b"".join(path.read_bytes() for path in parts)
    return base64.b64decode(encoded, validate=True)


def archive_manifest(archive_bytes: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        if len(names) != len(set(names)):
            raise ValueError("runtime archive contains duplicate file names")
        return {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in names
        }
