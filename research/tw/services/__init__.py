"""Research services built only on canonical Taiwan market contracts."""

from .candidate_engine import (
    Candidate,
    CandidateEvidenceGate,
    CandidateResearchFusion,
    build_candidate_from_fusion,
    build_research_candidate,
    fuse_candidate_research,
    insufficient_data_candidate,
    rank_candidates_for_review,
    score_candidate_for_review,
    validate_candidate_evidence,
)
from .historical_window import (
    HistoricalIntegrityError,
    HistoricalWindow,
    build_historical_window,
)
from .stock_workspace import (
    StockQuoteSnapshot,
    StockWorkspaceSnapshot,
    build_stock_workspace,
)

__all__ = [
    "Candidate",
    "CandidateEvidenceGate",
    "CandidateResearchFusion",
    "build_candidate_from_fusion",
    "build_research_candidate",
    "fuse_candidate_research",
    "insufficient_data_candidate",
    "rank_candidates_for_review",
    "score_candidate_for_review",
    "validate_candidate_evidence",
    "HistoricalIntegrityError",
    "HistoricalWindow",
    "build_historical_window",
    "StockQuoteSnapshot",
    "StockWorkspaceSnapshot",
    "build_stock_workspace",
]
