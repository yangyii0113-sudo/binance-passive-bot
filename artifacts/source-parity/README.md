# FOXYYA Production Source Parity

This directory records the immutable parity baseline used to normalize the deployed FOXYYA backend into a canonical Git source tree.

- Production archive SHA256: `7bb528aa57add170cc4909f0d4fe6671c27248469bb484a6b79e1c59ff13a3f3`
- Source origin: `backend_parts2/part00..part04`
- Normalized target: `src/foxyya/`
- Rule: normalized Python module bytes must match the production archive member hashes exactly.
- No A/B/C/D strategy semantics are modified by source normalization.

The executable parity contract is `tests/test_source_parity.py`.
