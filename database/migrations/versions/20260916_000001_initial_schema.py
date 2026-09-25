"""AVASYA initial schema: PostGIS, enum, and all tables.

Revision ID: 20260916_000001
Revises:
Create Date: 2026-09-16

AVASYA OPERATIONAL METHODOLOGY NOTE:
This is the first real migration of the project (the handoff's claimed
"20260913_000003" migration never existed in any branch - see
docs/AUDIT_BEFORE_IMPLEMENTATION.md). Tables for the new engines
(hazard status, response time, transport, claim validation) are additive
JSON/audit structures - they do not alter the locked risk model tables.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

from backend.models.enums import DataOrigin

revision = "20260916_000001"
down_revision = None
branch_labels = None
depends_on = None

def _data_origin_enum() -> PG_ENUM:
    """Fresh postgres-dialect ENUM per usage with create_type=False.

    Generic sqlalchemy.Enum silently IGNORES create_type=False (that flag
    only exists on the postgresql dialect type), so every op.create_table
    re-emitted CREATE TYPE and the migration died with DuplicateObject on
    the second table. The postgresql.ENUM honors it; the type itself is
    created exactly once in upgrade()."""
    return PG_ENUM(
        DataOrigin,
        name="data_origin",
        create_type=False,
        validate_strings=True,
    )


def _table(name: str) -> sa.Table:
    return sa.Table(name, sa.MetaData(), autoload_with=op.get_bind())


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    _data_origin_enum().create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("char_length(email) > 0", name="ck_users_email_not_empty"),
    )

    op.create_table(
        "habitations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("village_or_ward", sa.String(255), nullable=True),
        sa.Column("district", sa.String(255), nullable=True),
        sa.Column("state", sa.String(255), nullable=True),
        sa.Column("country", sa.String(255), nullable=True),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("population", sa.Integer, nullable=True, server_default="0"),
        sa.Column("households", sa.Integer, nullable=True, server_default="0"),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("population >= 0", name="ck_habitations_population_non_negative"),
        sa.CheckConstraint("households >= 0", name="ck_habitations_households_non_negative"),
    )
    op.create_index("ix_habitations_user_id", "habitations", ["user_id"])
    op.create_index("ix_habitations_geom", "habitations", ["geom"], postgresql_using="gist")

    op.create_table(
        "hazards",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("hazard_type", sa.String(100), nullable=False),
        sa.Column("hazard_name", sa.String(255), nullable=True),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("severity_score", sa.Float, nullable=True),
        sa.Column("probability_score", sa.Float, nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("severity_score >= 0 AND severity_score <= 100", name="ck_hazards_severity_score_range"),
        sa.CheckConstraint("probability_score >= 0 AND probability_score <= 100", name="ck_hazards_probability_score_range"),
    )
    op.create_index("ix_hazards_geom", "hazards", ["geom"], postgresql_using="gist")

    op.create_table(
        "habitation_hazards",
        sa.Column("habitation_id", sa.Integer, sa.ForeignKey("habitations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("hazard_id", sa.Integer, sa.ForeignKey("hazards.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "destinations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("destination_type", sa.String(100), nullable=True),
        sa.Column("district", sa.String(255), nullable=True),
        sa.Column("state", sa.String(255), nullable=True),
        sa.Column("country", sa.String(255), nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("capacity_total", sa.Integer, nullable=True, server_default="0"),
        sa.Column("capacity_available", sa.Integer, nullable=True, server_default="0"),
        sa.Column("risk_score", sa.Float, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("capacity_total >= 0", name="ck_destinations_capacity_total_non_negative"),
        sa.CheckConstraint("capacity_available >= 0", name="ck_destinations_capacity_total_non_negative_available"),
        sa.CheckConstraint("risk_score >= 0 AND risk_score <= 100", name="ck_destinations_risk_score_range"),
    )
    op.create_index("ix_destinations_geom", "destinations", ["geom"], postgresql_using="gist")

    # risk_assessments must exist before evidence (evidence.risk_assessment_id FK)
    # and before relocation_priorities/recommendations reference it.
    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("habitation_id", sa.Integer, sa.ForeignKey("habitations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hazard_id", sa.Integer, sa.ForeignKey("hazards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assessor_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("overall_risk_score", sa.Float, nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("model_version", sa.String(50), nullable=False),
        sa.Column("input_snapshot", sa.JSON, nullable=True),
        sa.Column("normalized_values", sa.JSON, nullable=True),
        sa.Column("weights", sa.JSON, nullable=True),
        sa.Column("contributions", sa.JSON, nullable=True),
        sa.Column("reasons", sa.JSON, nullable=True),
        sa.Column("warnings", sa.JSON, nullable=True),
        sa.Column("freshness", sa.JSON, nullable=True),
        sa.Column("data_quality", sa.JSON, nullable=True),
        sa.Column("calculation_details", sa.JSON, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("overall_risk_score >= 0 AND overall_risk_score <= 100", name="ck_risk_score_range"),
    )

    op.create_table(
        "evidence",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("habitation_id", sa.Integer, sa.ForeignKey("habitations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("hazard_id", sa.Integer, sa.ForeignKey("hazards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("risk_assessment_id", sa.Integer, sa.ForeignKey("risk_assessments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(100), nullable=True),
        sa.Column("source_url", sa.String(2048), nullable=True),
        sa.Column("evidence_type", sa.String(120), nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("evidence_payload", sa.JSON, nullable=True),
        sa.Column("external_reference", sa.String(255), nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("char_length(source_name) > 0", name="ck_evidence_source_name_not_empty"),
    )
    op.create_index("ix_evidence_habitation_id", "evidence", ["habitation_id"])
    op.create_index("ix_evidence_hazard_id", "evidence", ["hazard_id"])
    op.create_index("ix_evidence_risk_assessment_id", "evidence", ["risk_assessment_id"])

    op.create_table(
        "relocation_priorities",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("habitation_id", sa.Integer, sa.ForeignKey("habitations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("priority_score", sa.Float, nullable=False),
        sa.Column("priority_label", sa.String(50), nullable=True),
        sa.Column("rationale", sa.JSON, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("priority_score >= 0 AND priority_score <= 100", name="ck_relocation_priority_score_range"),
    )

    op.create_table(
        "capacity_assessments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("habitation_id", sa.Integer, sa.ForeignKey("habitations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessed_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nominal_capacity", sa.Integer, nullable=False),
        sa.Column("existing_occupancy", sa.Integer, nullable=False),
        sa.Column("water_constraint", sa.Float, nullable=True),
        sa.Column("sanitation_constraint", sa.Float, nullable=True),
        sa.Column("safety_reserve", sa.Float, nullable=True),
        sa.Column("required_capacity", sa.Integer, nullable=False),
        sa.Column("usable_capacity", sa.Integer, nullable=False),
        sa.Column("capacity_gap", sa.Integer, nullable=False),
        sa.Column("status", sa.String(50), nullable=True),
        sa.Column("assessment_details", sa.JSON, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("nominal_capacity >= 0", name="ck_capacity_assessment_nominal_capacity_non_negative"),
        sa.CheckConstraint("existing_occupancy >= 0", name="ck_capacity_assessment_existing_occupancy_non_negative"),
        sa.CheckConstraint("required_capacity >= 0", name="ck_capacity_assessment_required_capacity_non_negative"),
        sa.CheckConstraint("usable_capacity >= 0", name="ck_capacity_assessment_usable_capacity_non_negative"),
        sa.CheckConstraint("water_constraint >= 0 AND water_constraint <= 100", name="ck_capacity_assessment_water_constraint_range"),
        sa.CheckConstraint("sanitation_constraint >= 0 AND sanitation_constraint <= 100", name="ck_capacity_assessment_sanitation_constraint_range"),
        sa.CheckConstraint("safety_reserve >= 0", name="ck_capacity_assessment_safety_reserve_non_negative"),
    )

    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("risk_assessment_id", sa.Integer, sa.ForeignKey("risk_assessments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("relocation_priority_id", sa.Integer, sa.ForeignKey("relocation_priorities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recommendation_type", sa.String(100), nullable=True),
        sa.Column("summary", sa.String(255), nullable=False),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("confidence_score >= 0 AND confidence_score <= 100", name="ck_recommendation_confidence_score_range"),
    )

    op.create_table(
        "recommendation_approvals",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recommendation_id", sa.Integer, sa.ForeignKey("recommendations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("officer_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("original_recommendation", sa.JSON, nullable=True),
        sa.Column("final_destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("override_note", sa.String, nullable=True),
        sa.Column("data_origin", _data_origin_enum(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("recommendation_approvals")
    op.drop_table("recommendations")
    op.drop_table("capacity_assessments")
    op.drop_table("destinations")
    op.drop_table("relocation_priorities")
    op.drop_table("risk_assessments")
    op.drop_table("evidence")
    op.drop_table("habitation_hazards")
    op.drop_table("hazards")
    op.drop_table("habitations")
    op.drop_table("users")
    _data_origin_enum().drop(op.get_bind(), checkfirst=True)
