from pathlib import Path
import hashlib
import io
import zipfile

from tools.verify_runtime_archive import archive_manifest, assemble_runtime_archive


ARCHIVE_PREFIX = "foxyya_runtime_backend/"
SOURCE_PREFIX = ARCHIVE_PREFIX + "src/"
CANONICAL_ROOT_FILES = {
    ARCHIVE_PREFIX + "FOXYYA_V2_CONFIG.json": Path("FOXYYA_V2_CONFIG.json"),
    ARCHIVE_PREFIX + "intel_feeds.py": Path("intel_feeds.py"),
    ARCHIVE_PREFIX + "run_forward_paper.py": Path("run_forward_paper.py"),
}


def test_production_archive_has_unique_hashed_files():
    archive = assemble_runtime_archive(Path("backend_parts2"))
    manifest = archive_manifest(archive)

    assert archive
    assert manifest
    assert len(manifest) == len(set(manifest))
    assert all(len(digest) == 64 for digest in manifest.values())


def test_canonical_source_matches_production_archive_byte_for_byte():
    archive_bytes = assemble_runtime_archive(Path("backend_parts2"))
    manifest = archive_manifest(archive_bytes)
    mapped_members = {
        name: Path(name.removeprefix(ARCHIVE_PREFIX))
        for name in manifest
        if name.startswith(SOURCE_PREFIX)
    }
    mapped_members.update(CANONICAL_ROOT_FILES)

    assert any(name.startswith(SOURCE_PREFIX) for name in mapped_members)

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for archive_name, repo_path in sorted(mapped_members.items()):
            assert repo_path.is_file(), f"missing canonical source: {repo_path}"
            actual = repo_path.read_bytes()
            expected = archive.read(archive_name)
            assert hashlib.sha256(actual).hexdigest() == manifest[archive_name]
            assert actual == expected
