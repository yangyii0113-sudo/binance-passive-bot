#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import zipfile


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _part_paths(parts_dir: Path) -> list[Path]:
    parts = sorted(p for p in parts_dir.iterdir() if p.is_file() and p.name.startswith("part"))
    if not parts:
        raise ValueError(f"no backend parts found in {parts_dir}")
    return parts


def reconstruct_archive(parts_dir: Path) -> bytes:
    encoded = b"".join(path.read_bytes().strip() for path in _part_paths(parts_dir))
    archive = base64.b64decode(encoded, validate=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        names = zf.namelist()
        if len(names) != len(set(names)):
            raise ValueError("production archive contains duplicate member names")
        bad_member = zf.testzip()
        if bad_member is not None:
            raise ValueError(f"production archive failed CRC check at {bad_member}")
    return archive


def archive_manifest(archive: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        file_infos = [info for info in zf.infolist() if not info.is_dir()]
        members = [info.filename for info in file_infos]
        member_sha256 = {info.filename: _sha256(zf.read(info)) for info in file_infos}
        member_size = {info.filename: info.file_size for info in file_infos}
    return {
        "archive_sha256": _sha256(archive),
        "members": members,
        "member_sha256": member_sha256,
        "member_size": member_size,
    }


def production_manifest(parts_dir: Path) -> dict:
    archive = reconstruct_archive(parts_dir)
    manifest = archive_manifest(archive)
    manifest["parts"] = [
        {"name": path.name, "size": path.stat().st_size, "sha256": _sha256(path.read_bytes())}
        for path in _part_paths(parts_dir)
    ]
    return manifest


def extract_archive(archive: bytes, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for info in zf.infolist():
            target = (destination / info.filename).resolve()
            if root != target and root not in target.parents:
                raise ValueError(f"unsafe archive member path: {info.filename}")
        zf.extractall(destination)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconstruct and verify the exact FOXYYA production backend archive")
    parser.add_argument("--parts-dir", type=Path, default=Path("backend_parts2"))
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--extract-to", type=Path)
    args = parser.parse_args()

    archive = reconstruct_archive(args.parts_dir)
    manifest = production_manifest(args.parts_dir)
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.extract_to:
        extract_archive(archive, args.extract_to)
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
