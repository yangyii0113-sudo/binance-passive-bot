from pathlib import Path
import hashlib
import io
import zipfile

from tools.verify_runtime_archive import archive_manifest, assemble_runtime_archive


ARCHIVE_PREFIX = "foxyya_runtime_backend/"
SOURCE_PREFIX = ARCHIVE_PREFIX + "src/"


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
    source_members = {
        name: digest
        for name, digest in manifest.items()
        if name.startswith(SOURCE_PREFIX)
    }

    assert source_members, "production archive has no src/ members"

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for archive_name, expected_digest in sorted(source_members.items()):
            repo_path = Path(archive_name.removeprefix(ARCHIVE_PREFIX))
            assert repo_path.is_file(), f"missing canonical source: {repo_path}"
            actual = repo_path.read_bytes()
            assert hashlib.sha256(actual).hexdigest() == expected_digest
            assert actual == archive.read(archive_name)
