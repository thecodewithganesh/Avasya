from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.core.database import get_db
from backend.models import (
    CapacityAssessment,
    Destination,
    Habitation,
    Recommendation,
    RecommendationApproval,
    RelocationPriority,
    RiskAssessment,
    User,
)
from backend.models.enums import DataOrigin
from backend.schemas.api import (
    ApprovalHistoryEntry,
    ApprovalRequest,
    ApprovalResponse,
    CapacityResponse,
    DestinationResponse,
    HabitationResponse,
    RecommendationQueueEntry,
    RecommendationResponse,
    RelocationResponse,
    RiskResponse,
)

router = APIRouter(prefix="/api/v1", tags=["AVASYA"])


def _habitation(db: Session, habitation_id: int) -> Habitation:
    item = db.scalar(select(Habitation).where(Habitation.id == habitation_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Habitation not found")
    return item


def _capacity(item: CapacityAssessment) -> CapacityResponse:
    return CapacityResponse.model_validate(
        {
            **{field: getattr(item, field) for field in (
                "id", "destination_id", "habitation_id", "nominal_capacity",
                "existing_occupancy", "water_constraint", "sanitation_constraint",
                "safety_reserve", "usable_capacity", "required_capacity",
                "capacity_gap", "status", "assessment_details", "data_origin",
            )},
            "eligibility": item.usable_capacity >= item.required_capacity,
        }
    )


def _destination(db: Session, destination: Destination, habitation_id: int) -> DestinationResponse:
    capacity = db.scalar(
        select(CapacityAssessment)
        .where(
            CapacityAssessment.destination_id == destination.id,
            CapacityAssessment.habitation_id == habitation_id,
        )
        .order_by(CapacityAssessment.created_at.desc())
    )
    return DestinationResponse.model_validate(
        {
            **{field: getattr(destination, field) for field in (
                "id", "name", "destination_type", "district", "state",
                "country", "risk_score", "data_origin",
            )},
            "capacity": _capacity(capacity) if capacity else None,
        }
    )


def _recommendation(item: Recommendation) -> RecommendationResponse:
    return RecommendationResponse.model_validate(
        {
            "id": item.id,
            "summary": item.summary,
            "recommendation_type": item.recommendation_type,
            "details": item.details,
            "confidence_score": item.confidence_score,
            "destination_id": item.destination_id,
            "data_origin": item.data_origin,
            "created_at": item.created_at,
        }
    )


def _officer(
    db: Session = Depends(get_db),
    x_officer_email: str | None = Header(default=None, alias="X-Officer-Email"),
    authorization: str | None = Header(default=None),
) -> User:
    """Resolve the acting officer.

    Priority order:
      1. ``Authorization: Bearer <jwt>`` — when Supabase auth is configured
         (SUPABASE_URL + SUPABASE_JWT_SECRET), the token is verified
         cryptographically (HS256, audience 'authenticated', expiry) and the
         user is resolved against the users table. A *present but invalid*
         token is always 401 — never a silent fallback.
      2. ``X-Officer-Email`` demo mechanism — unchanged local fallback for
         when Supabase is not configured.
    """
    from backend.integrations.supabase import (
        SupabaseAuthError,
        supabase_config,
        verify_supabase_token,
        resolve_user,
    )

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if not token:
            raise HTTPException(status_code=401, detail="Empty bearer token")
        if supabase_config.auth_configured:
            try:
                claims = verify_supabase_token(token)
            except SupabaseAuthError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            user = resolve_user(db, claims)
            if user is None or not user.role or user.role.lower() not in {"officer", "admin"}:
                raise HTTPException(
                    status_code=401,
                    detail="Authenticated user has no officer role",
                )
            return user
        # Supabase not configured: accept the legacy "bearer <email>" demo
        # form for backwards compatibility, then fall through to the header.
        email = token
    else:
        email = x_officer_email

    if not email:
        raise HTTPException(status_code=401, detail="Officer authentication required")
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.role or user.role.lower() not in {"officer", "admin"}:
        raise HTTPException(status_code=401, detail="Invalid officer authentication")
    return user


@router.get("/habitations", response_model=list[HabitationResponse], summary="List habitations")
def list_habitations(
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum records to return"),
) -> list[Habitation]:
    return list(
        db.scalars(
            select(Habitation).order_by(Habitation.id).offset(offset).limit(limit)
        ).all()
    )


@router.get("/habitations/{habitation_id}", response_model=HabitationResponse, summary="Get a habitation")
def get_habitation(habitation_id: int, db: Session = Depends(get_db)) -> Habitation:
    return _habitation(db, habitation_id)


@router.get("/habitations/{habitation_id}/risk", response_model=RiskResponse, summary="Get stored habitation risk")
def get_risk(habitation_id: int, db: Session = Depends(get_db)) -> RiskAssessment:
    _habitation(db, habitation_id)
    item = db.scalar(
        select(RiskAssessment)
        .where(RiskAssessment.habitation_id == habitation_id)
        .order_by(RiskAssessment.generated_at.desc())
    )
    if item is None:
        raise HTTPException(status_code=503, detail="Risk assessment evidence unavailable")
    return item


@router.get("/habitations/{habitation_id}/relocation", response_model=RelocationResponse, summary="Get relocation priority")
def get_relocation(habitation_id: int, db: Session = Depends(get_db)) -> RelocationResponse:
    _habitation(db, habitation_id)
    item = db.scalar(
        select(RelocationPriority)
        .options(selectinload(RelocationPriority.destination))
        .where(RelocationPriority.habitation_id == habitation_id)
        .order_by(RelocationPriority.priority_score.desc(), RelocationPriority.created_at.desc())
    )
    if item is None:
        raise HTTPException(status_code=503, detail="Relocation assessment evidence unavailable")
    destination = (
        _destination(db, item.destination, habitation_id)
        if item.destination is not None
        else None
    )
    if destination and destination.capacity and not destination.capacity.eligibility:
        destination = None
    return RelocationResponse.model_validate(
        {
            "id": item.id,
            "habitation_id": item.habitation_id,
            "destination_id": item.destination_id if destination else None,
            "priority_score": item.priority_score,
            "priority_label": item.priority_label,
            "rationale": item.rationale,
            "destination": destination,
            "data_origin": item.data_origin,
        }
    )


@router.get("/habitations/{habitation_id}/destinations", response_model=list[DestinationResponse], summary="List eligible destinations")
def get_destinations(habitation_id: int, db: Session = Depends(get_db)) -> list[DestinationResponse]:
    _habitation(db, habitation_id)
    assessments = list(
        db.scalars(
            select(CapacityAssessment)
            .options(selectinload(CapacityAssessment.destination))
            .where(CapacityAssessment.habitation_id == habitation_id)
            .order_by(CapacityAssessment.id)
        ).all()
    )
    return [
        _destination(db, item.destination, habitation_id)
        for item in assessments
        if item.destination is not None and item.usable_capacity >= item.required_capacity
    ]


@router.get("/destinations/{destination_id}/capacity", response_model=CapacityResponse, summary="Get destination capacity")
def get_capacity(destination_id: int, db: Session = Depends(get_db)) -> CapacityResponse:
    destination = db.scalar(select(Destination).where(Destination.id == destination_id))
    if destination is None:
        raise HTTPException(status_code=404, detail="Destination not found")
    item = db.scalar(
        select(CapacityAssessment)
        .where(CapacityAssessment.destination_id == destination_id)
        .order_by(CapacityAssessment.created_at.desc())
    )
    if item is None:
        raise HTTPException(status_code=503, detail="Capacity assessment evidence unavailable")
    return _capacity(item)


@router.get("/habitations/{habitation_id}/recommendation", response_model=RecommendationResponse, summary="Get recommendation")
def get_recommendation(habitation_id: int, db: Session = Depends(get_db)) -> RecommendationResponse:
    _habitation(db, habitation_id)
    item = db.scalar(
        select(Recommendation)
        .join(RiskAssessment, Recommendation.risk_assessment_id == RiskAssessment.id, isouter=True)
        .join(RelocationPriority, Recommendation.relocation_priority_id == RelocationPriority.id, isouter=True)
        .where(
            (RiskAssessment.habitation_id == habitation_id)
            | (RelocationPriority.habitation_id == habitation_id)
        )
        .order_by(Recommendation.created_at.desc())
    )
    if item is None:
        raise HTTPException(status_code=503, detail="Recommendation evidence unavailable")
    return _recommendation(item)


@router.post(
    "/recommendations/{recommendation_id}/approval",
    response_model=ApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Approve or override a recommendation",
)
def approve_recommendation(
    recommendation_id: int,
    request: ApprovalRequest,
    db: Session = Depends(get_db),
    officer: User = Depends(_officer),
) -> RecommendationApproval:
    recommendation = db.scalar(
        select(Recommendation).where(Recommendation.id == recommendation_id)
    )
    if recommendation is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    if request.action == "OVERRIDE" and not request.override_note:
        raise HTTPException(status_code=422, detail="override_note is required for OVERRIDE")
    if request.final_destination_id is not None:
        destination = db.scalar(
            select(Destination).where(Destination.id == request.final_destination_id)
        )
        if destination is None:
            raise HTTPException(status_code=404, detail="Final destination not found")
        if recommendation.relocation_priority_id:
            capacity = db.scalar(
                select(CapacityAssessment).where(
                    CapacityAssessment.destination_id == destination.id,
                    CapacityAssessment.habitation_id
                    == select(RelocationPriority.habitation_id)
                    .where(RelocationPriority.id == recommendation.relocation_priority_id)
                    .scalar_subquery(),
                )
            )
            if capacity is None:
                raise HTTPException(
                    status_code=503,
                    detail="Capacity assessment evidence unavailable for final destination",
                )
            if capacity.usable_capacity < capacity.required_capacity:
                raise HTTPException(status_code=422, detail="Destination has insufficient usable capacity")
    original = {
        "id": recommendation.id,
        "summary": recommendation.summary,
        "recommendation_type": recommendation.recommendation_type,
        "details": recommendation.details,
        "destination_id": recommendation.destination_id,
        "confidence_score": recommendation.confidence_score,
    }
    approval = RecommendationApproval(
        recommendation_id=recommendation.id,
        officer_user_id=officer.id,
        action="APPROVED" if request.action == "APPROVE" else "OVERRIDDEN",
        original_recommendation=original,
        final_destination_id=request.final_destination_id or recommendation.destination_id,
        override_note=request.override_note,
        data_origin=officer.data_origin,
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


@router.get(
    "/recommendations",
    response_model=list[RecommendationQueueEntry],
    summary="Officer decision queue (latest recommendation per habitation)",
)
def list_recommendation_queue(
    limit: int = Query(100, ge=1, le=500, description="Maximum records to return"),
    include_decided: bool = Query(default=True, description="Include habitations whose latest recommendation already has an officer decision"),
    db: Session = Depends(get_db),
) -> list[RecommendationQueueEntry]:
    """Decision-queue feed: the newest recommendation for each habitation.

    Each entry carries the habitation context (name, district, population,
    risk, priority) and whether an officer decision already exists, so the
    UI can filter decided villages instead of re-showing them as pending.
    """
    latest_rec_ids = (
        select(func.max(Recommendation.id))
        .join(
            RelocationPriority,
            Recommendation.relocation_priority_id == RelocationPriority.id,
        )
        .group_by(RelocationPriority.habitation_id)
        .correlate(None)
        .scalar_subquery()
    )
    decided_rec_ids = select(RecommendationApproval.recommendation_id).scalar_subquery()
    stmt = (
        select(Recommendation, RelocationPriority, Habitation, Destination, RecommendationApproval)
        .join(RelocationPriority, Recommendation.relocation_priority_id == RelocationPriority.id)
        .join(Habitation, RelocationPriority.habitation_id == Habitation.id)
        .join(Destination, Recommendation.destination_id == Destination.id, isouter=True)
        .join(RecommendationApproval, RecommendationApproval.recommendation_id == Recommendation.id, isouter=True)
        .where(Recommendation.id.in_(latest_rec_ids))
        .order_by(RelocationPriority.priority_score.desc(), Recommendation.id.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    queue: list[RecommendationQueueEntry] = []
    for recommendation, priority, habitation, destination, approval in rows:
        if not include_decided and approval is not None:
            continue
        capacity_status = ((recommendation.details or {}).get("capacity_status") if recommendation.details else None) or (
            "SUFFICIENT" if destination is not None else None
        )
        queue.append(
            RecommendationQueueEntry(
                recommendation_id=recommendation.id,
                habitation_id=habitation.id if habitation else None,
                habitation_name=habitation.name if habitation else None,
                district=habitation.district if habitation else None,
                state=habitation.state if habitation else None,
                population=habitation.population if habitation else None,
                priority_label=priority.priority_label if priority else None,
                risk_score=priority.priority_score if priority else None,
                risk_level=("HIGH" if (priority.priority_score or 0) >= 75 else "MEDIUM" if (priority.priority_score or 0) >= 50 else "LOW") if priority else None,
                recommendation_type=recommendation.recommendation_type,
                summary=recommendation.summary,
                destination_id=destination.id if destination else None,
                destination_name=destination.name if destination else None,
                capacity_status=capacity_status,
                decided=approval is not None,
                decided_action=approval.action if approval else None,
                data_origin=recommendation.data_origin.value if hasattr(recommendation.data_origin, "value") else str(recommendation.data_origin),
            )
        )
    return queue


@router.get(
    "/recommendations/approvals",
    response_model=list[ApprovalHistoryEntry],
    summary="Officer decision history (persisted approvals/overrides)",
)
def list_approval_history(
    limit: int = Query(50, ge=1, le=200, description="Maximum records to return"),
    db: Session = Depends(get_db),
) -> list[ApprovalHistoryEntry]:
    """Persisted officer decisions, newest first.

    Backs the frontend Officer Decision History panel: past-session records
    survive reloads because they are read from the database (the panel's
    session log remains an additive local overlay).
    """
    rows = db.execute(
        select(RecommendationApproval, Recommendation, Habitation, Destination)
        .join(Recommendation, RecommendationApproval.recommendation_id == Recommendation.id)
        .join(RelocationPriority, Recommendation.relocation_priority_id == RelocationPriority.id, isouter=True)
        .join(Habitation, RelocationPriority.habitation_id == Habitation.id, isouter=True)
        .join(Destination, RecommendationApproval.final_destination_id == Destination.id, isouter=True)
        .order_by(RecommendationApproval.created_at.desc(), RecommendationApproval.id.desc())
        .limit(limit)
    ).all()
    history: list[ApprovalHistoryEntry] = []
    for approval, recommendation, habitation, destination in rows:
        history.append(
            ApprovalHistoryEntry(
                approval_id=approval.id,
                recommendation_id=approval.recommendation_id,
                action=approval.action,
                decision_time=approval.created_at,
                officer_user_id=approval.officer_user_id,
                habitation_id=habitation.id if habitation else None,
                habitation_name=habitation.name if habitation else None,
                recommendation_summary=recommendation.summary,
                original_destination_id=(approval.original_recommendation or {}).get("destination_id"),
                final_destination_id=approval.final_destination_id,
                final_destination_name=destination.name if destination else None,
                override_note=approval.override_note,
                data_origin=approval.data_origin.value if hasattr(approval.data_origin, "value") else str(approval.data_origin),
            )
        )
    return history
