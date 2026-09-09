from pathlib import Path

from tools.verify_runtime_archive import archive_manifest, assemble_runtime_archive


def test_production_archive_has_unique_hashed_files():
    archive = assemble_runtime_archive(Path("backend_parts2"))
    manifest = archive_manifest(archive)

    assert archive
    assert manifest
    assert len(manifest) == len(set(manifest))
    assert all(len(digest) == 64 for digest in manifest.values())
