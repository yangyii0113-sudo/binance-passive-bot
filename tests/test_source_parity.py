from pathlib import Path
import hashlib
import json


ROOT = Path(__file__).resolve().parents[1]
PARTS_DIR = ROOT / "backend_parts2"
EXTRACTOR = ROOT / "tools" / "extract_production_backend.py"
NORMALIZED_SRC = ROOT / "src" / "foxyya"
MANIFEST_PATH = ROOT / "artifacts" / "source-parity" / "production_manifest.json"
ARCHIVE_PREFIX = "foxyya_runtime_backend/src/foxyya/"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_extractor_script_exists():
    assert EXTRACTOR.exists(), "production backend extractor has not been implemented yet"


def test_reconstructed_archive_contains_core_production_modules():
    from tools.extract_production_backend import archive_manifest, reconstruct_archive

    archive = reconstruct_archive(PARTS_DIR)
    manifest = archive_manifest(archive)

    assert "foxyya_runtime_backend/src/foxyya/runner.py" in manifest["members"]
    assert "foxyya_runtime_backend/src/foxyya/execution.py" in manifest["members"]
    assert "foxyya_runtime_backend/src/foxyya/ledger.py" in manifest["members"]
    assert manifest["archive_sha256"]
    assert manifest["member_sha256"]["foxyya_runtime_backend/src/foxyya/runner.py"]


def test_reconstruction_is_deterministic():
    from tools.extract_production_backend import reconstruct_archive

    first = reconstruct_archive(PARTS_DIR)
    second = reconstruct_archive(PARTS_DIR)
    assert first == second


def test_normalized_source_hashes_match_production_archive():
    from tools.extract_production_backend import production_manifest

    expected = production_manifest(PARTS_DIR)
    archived_modules = {
        member: digest
        for member, digest in expected["member_sha256"].items()
        if member.startswith(ARCHIVE_PREFIX)
    }
    assert archived_modules, "production archive did not contain foxyya source modules"
    assert NORMALIZED_SRC.exists(), "normalized src/foxyya tree has not been generated yet"

    for member, digest in archived_modules.items():
        relative = member.removeprefix(ARCHIVE_PREFIX)
        local = NORMALIZED_SRC / relative
        assert local.is_file(), f"normalized source missing {relative}"
        assert _sha256(local) == digest, f"normalized source drifted from production archive: {relative}"


def test_committed_manifest_matches_reconstructed_archive():
    from tools.extract_production_backend import production_manifest

    assert MANIFEST_PATH.is_file(), "production source manifest has not been committed yet"
    committed = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = production_manifest(PARTS_DIR)
    assert committed == expected
