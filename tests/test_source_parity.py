from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PARTS_DIR = ROOT / "backend_parts2"
EXTRACTOR = ROOT / "tools" / "extract_production_backend.py"


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
