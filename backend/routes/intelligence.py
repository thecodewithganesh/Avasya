from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.integrations.claim_validator import ClaimValidator
from backend.integrations.contracts import (
    ClaimValidationReport,
    LlmRequest,
    LlmResponse,
    RagQueryRequest,
    RagQueryResponse,
)
from backend.integrations.llm_client import LlmIntegrationPending, llm_client
from backend.integrations.rag_client import RagIntegrationPending, rag_client
from backend.models import Evidence
from backend.services.alerts import AlertService
from backend.services.hazard_status import HazardStatusService
from backend.services.pipeline import DecisionPipelineService
from backend.services.response_time import ResponseTimeService
from backend.services.transport import TransportService


router = APIRouter(prefix="/api/v1", tags=["AVASYA Intelligence"])


def _habitation_exists(db: Session, habitation_id: int) -> None:
    from backend.models import Habitation

    if db.get(Habitation, habitation_id) is None:
        raise HTTPException(status_code=404, detail="Habitation not found")


@router.get(
    "/habitations/{habitation_id}/hazards",
    summary="Hazard statuses for a habitation (RED/YELLOW/NO_ALERT/DATA_UNAVAILABLE)",
)
def get_habitation_hazards(habitation_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _habitation_exists(db, habitation_id)
    try:
        return [item.to_dict() for item in HazardStatusService(db).for_habitation(habitation_id)]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/habitations/{habitation_id}/hazards/overall",
    summary="Highest-concern hazard status for a habitation",
)
def get_overall_hazard_status(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _habitation_exists(db, habitation_id)
    return HazardStatusService(db).overall(habitation_id).to_dict()


@router.get(
    "/habitations/{habitation_id}/response-time",
    summary="Response window / urgency posture (AVASYA operational methodology)",
)
def get_response_time(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _habitation_exists(db, habitation_id)
    overall = HazardStatusService(db).overall(habitation_id)
    transport_time: float | None = None
    try:
        from backend.models import Habitation

        habitation = db.get(Habitation, habitation_id)
        required = max(1, habitation.population or habitation.households or 1)
        plan = TransportService(db).plan(habitation_id, required)
        if plan.recommended_route:
            transport_time = plan.recommended_route.travel_time_hours
    except ValueError:
        transport_time = None  # transport DATA_UNAVAILABLE; response time still answers
    return ResponseTimeService(db).assess(
        habitation_id, overall, transport_time_hours=transport_time
    ).to_dict()


@router.get(
    "/habitations/{habitation_id}/transport",
    summary="Capacity-constrained transport plan with route alternatives",
)
def get_transport(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _habitation_exists(db, habitation_id)
    from backend.models import Habitation

    habitation = db.get(Habitation, habitation_id)
    required = max(1, habitation.population or habitation.households or 1)
    try:
        return TransportService(db).plan(habitation_id, required).to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/habitations/{habitation_id}/alerts",
    summary="AVASYA decision-support alerts (NOT official government warnings)",
)
def get_alerts(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _habitation_exists(db, habitation_id)
    overall = HazardStatusService(db).overall(habitation_id)
    from backend.models import Habitation

    habitation = db.get(Habitation, habitation_id)
    required = max(1, habitation.population or habitation.households or 1)
    transport_time: float | None = None
    try:
        plan = TransportService(db).plan(habitation_id, required)
        if plan.recommended_route:
            transport_time = plan.recommended_route.travel_time_hours
    except ValueError:
        transport_time = None
    response = ResponseTimeService(db).assess(habitation_id, overall, transport_time_hours=transport_time)
    alert = AlertService(db).from_hazard_result(overall, response)
    return {
        "alerts": [alert.to_dict()] if alert else [],
        "disclaimer": "AVASYA decision-support alerts are NOT official government warnings.",
    }


@router.post(
    "/habitations/{habitation_id}/assess",
    summary="Run the full decision chain: hazard -> risk -> priority -> capacity -> transport -> response -> alert",
)
def assess_habitation(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return DecisionPipelineService(db).run(habitation_id).to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/rag/query",
    summary="RAG evidence retrieval (grounded semantic search over the indexed evidence corpus)",
)
def rag_query(
    request: RagQueryRequest,
    db: Session = Depends(get_db),
) -> RagQueryResponse:
    try:
        return rag_client.query(request, db=db)
    except (RagIntegrationPending, Exception) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "integration_pending": True,
                "message": str(exc),
                "grounding_status": "UNSUPPORTED",
                "results": [],
            },
        ) from exc


@router.post(
    "/llm/explain",
    summary="LLM explanation (delegates to the LLM teammate's module; never authoritative for operational values)",
)
def llm_explain(request: LlmRequest) -> LlmResponse:
    try:
        return llm_client.explain(request)
    except LlmIntegrationPending as exc:
        raise HTTPException(
            status_code=503,
            detail={"integration_pending": True, "message": str(exc)},
        ) from exc


@router.post(
    "/llm/retrieval-plan",
    summary="LLM Stage 1: understand a hazard event and produce RAG retrieval requirements",
)
def llm_retrieval_plan(request: dict[str, Any]) -> dict[str, Any]:
    try:
        from ai.llm.llm_service import LlmNotConfigured, LlmRuntimeError, llm_service_singleton

        plan = llm_service_singleton.build_retrieval_plan(request)
        return plan.model_dump()
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail={"integration_pending": True, "message": "ai/llm module unavailable"},
        ) from None
    except LlmNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={"integration_pending": True, "message": str(exc)},
        ) from exc
    except LlmRuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/habitations/{habitation_id}/claims/validate",
    response_model=ClaimValidationReport,
    summary="Validate LLM claims against AVASYA structured data (VERIFIED/CONFLICT/UNSUPPORTED)",
)
def validate_claims(habitation_id: int, request: LlmRequest, db: Session = Depends(get_db)) -> ClaimValidationReport:
    _habitation_exists(db, habitation_id)
    return ClaimValidator(db).validate(habitation_id, request.claims)


@router.get(
    "/knowledge-sources",
    summary="Dataset/evidence provenance registry (REAL/MIXED/SYNTHETIC_DEMO/DATA_UNAVAILABLE)",
)
def knowledge_sources(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    rows = list(db.scalars(
        select(Evidence)
        .where(Evidence.habitation_id.is_(None), Evidence.hazard_id.is_(None))
        .order_by(Evidence.id)
        .offset(offset)
        .limit(min(limit, 500))
    ).all())
    total = len(rows)
    by_origin: dict[str, int] = {}
    for row in rows:
        by_origin[row.data_origin.value] = by_origin.get(row.data_origin.value, 0) + 1
    return {
        "count": total,
        "by_data_origin": by_origin,
        "sources": [
            {
                "id": row.id,
                "source_name": row.source_name,
                "source_type": row.source_type,
                "evidence_type": row.evidence_type,
                "source_url": row.source_url,
                "external_reference": row.external_reference,
                "retrieved_at": row.created_at.isoformat() if row.created_at else None,
                "data_origin": row.data_origin.value,
                "payload_dataset": (row.evidence_payload or {}).get("dataset") if row.evidence_payload else None,
                "payload_version_or_date": (row.evidence_payload or {}).get("version_or_date") if row.evidence_payload else None,
            }
            for row in rows
        ],
    }
