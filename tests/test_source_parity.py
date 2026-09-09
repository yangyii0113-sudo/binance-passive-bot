from pathlib import Path
import hashlib
import json


ROOT = Path(__file__).resolve().parents[1]
PARTS_DIR = ROOT / "backend_parts2"
EXTRACTOR = ROOT / "tools" / "extract_production_backend.py"
NORMALIZED_SRC = ROOT / "src" / "foxyya"
RUNTIME_BACKEND = ROOT / "runtime_backend"
MANIFEST_PATH = ROOT / "artifacts" / "source-parity" / "production_manifest.json"
DOCKERFILE = ROOT / "Dockerfile"
ARCHIVE_PREFIX = "foxyya_runtime_backend/src/foxyya/"
RUNTIME_ASSETS = {
    "FOXYYA_V2_CONFIG.json": "foxyya_runtime_backend/FOXYYA_V2_CONFIG.json",
    "intel_feeds.py": "foxyya_runtime_backend/intel_feeds.py",
    "run_forward_paper.py": "foxyya_runtime_backend/run_forward_paper.py",
}


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


def test_runtime_support_assets_match_production_archive():
    from tools.extract_production_backend import production_manifest

    expected = production_manifest(PARTS_DIR)
    for local_name, archive_name in RUNTIME_ASSETS.items():
        local = RUNTIME_BACKEND / local_name
        assert local.is_file(), f"normalized runtime support asset missing: {local_name}"
        assert _sha256(local) == expected["member_sha256"][archive_name], f"runtime asset drifted: {local_name}"


def test_committed_manifest_matches_reconstructed_archive():
    from tools.extract_production_backend import production_manifest

    assert MANIFEST_PATH.is_file(), "production source manifest has not been committed yet"
    committed = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = production_manifest(PARTS_DIR)
    assert committed == expected


def test_dockerfile_uses_canonical_source_without_archive_reconstruction():
    text = DOCKERFILE.read_text(encoding="utf-8")
    forbidden = ["backend_parts2", "runtime_backend.b64", "base64", "zipfile", "part00", "part01", "part02", "part03", "part04"]
    for token in forbidden:
        assert token not in text, f"Dockerfile still depends on transitional archive packaging: {token}"

    assert "COPY src/foxyya /app/foxyya_runtime_backend/src/foxyya" in text
    assert "COPY runtime_backend/FOXYYA_V2_CONFIG.json runtime_backend/intel_feeds.py runtime_backend/run_forward_paper.py /app/foxyya_runtime_backend/" in text
    assert 'PAPER_ONLY=true' in text
    assert 'REAL_ORDER_LOCK=true' in text
    assert 'FOXYYA_DB=/data/foxyya_v2_paper.sqlite' in text
    assert 'CMD ["python","service.py"]' in text
