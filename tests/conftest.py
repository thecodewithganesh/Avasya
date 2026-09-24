from __future__ import annotations

import os

# The test suite owns its in-memory database and must not depend on the
# optional pytest-env plugin merely to import the application configuration.
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Text, create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.core.database import get_db
from backend.main import app
from backend.models import (
    Base,
    CapacityAssessment,
    Destination,
    Habitation,
    Hazard,
    HabitationHazard,
    User,
)
from backend.models.enums import DataOrigin


def _flatten_geometry_columns() -> None:
    """Render every Geometry column as plain Text for the SQLite test stack.

    Production schema comes from the Alembic/PostGIS migration, never from
    create_all, so this metadata mutation only affects the unit-test stack.
    geoalchemy2's spatial DDL (AddGeometryColumn / RecoverGeometryColumn /
    CreateSpatialIndex) has no meaning without PostGIS; flattening the type
    avoids all of it deterministically.
    """
    from geoalchemy2 import Geometry

    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, Geometry):
                column.type = Text()


_flatten_geometry_columns()

# ONE shared in-memory schema per pytest process. Every db_session fixture
# gets its own session on the same :memory: database (re-running create_all
# per test fails with "index already exists" because SQLAlchemy's checkfirst
# only guards tables, not indexes, on in-memory databases). Tests stay
# isolated because each fixture wipes all rows before yielding the session.
_shared_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@sa_event.listens_for(_shared_engine, "connect")
def _register_sqlite_functions(dbapi_conn, _record):  # noqa: ANN001
    # PostGIS-style CHAR_LENGTH used by CheckConstraints must exist at
    # INSERT time under SQLite.
    dbapi_conn.create_function("char_length", 1, lambda s: len(s) if s is not None else 0)


Base.metadata.create_all(bind=_shared_engine)


@pytest.fixture
def db_session():
    """In-memory relational session over the shared test schema.

    Geometry columns are stored as text in this lightweight fixture stack;
    PostGIS-specific behaviour is exercised by the live-database path
    (docker-compose + Alembic), not by these unit tests. The deterministic
    engine logic is what these tests lock down.
    """
    TestingSession = sessionmaker(bind=_shared_engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    # Row-level isolation between tests sharing one schema:
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(table.delete())
    session.commit()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(db_session):
    """FastAPI TestClient wired to the in-memory session."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def officer(db_session):
    user = User(
        email="officer@avasya.test",
        full_name="Test Officer",
        role="officer",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def habitation(db_session):
    item = Habitation(
        name="Test Habitation",
        district="Test District",
        state="Test State",
        country="India",
        latitude=12.9716,
        longitude=77.5946,
        geom="SRID=4326;POINT(77.5946 12.9716)",
        population=1200,
        households=300,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(item)
    db_session.commit()
    return item


@pytest.fixture
def demo_world(db_session, habitation):
    """A small deterministic world exercising every decision branch:

    - flood hazard linked to the habitation (RED-capable severity, REAL)
    - insufficient destination that FAILS the capacity gate
    - eligible destination that PASSES the capacity gate
    """
    hazard = Hazard(
        hazard_type="flood",
        hazard_name="Demo flood",
        severity_score=80.0,
        probability_score=60.0,
        geom="SRID=4326;POINT(77.5946 12.9716)",
        data_origin=DataOrigin.REAL,
    )
    db_session.add(hazard)
    db_session.flush()
    db_session.add(HabitationHazard(habitation_id=habitation.id, hazard_id=hazard.id))

    insufficient = Destination(
        name="Synthetic Insufficient Shelter",
        destination_type="DEMO_SHELTER",
        district=habitation.district,
        state=habitation.state,
        country="India",
        geom="SRID=4326;POINT(77.70 13.00)",
        capacity_total=100,
        capacity_available=100,
        risk_score=25.0,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    eligible = Destination(
        name="Synthetic Eligible Shelter",
        destination_type="DEMO_SHELTER",
        district=habitation.district,
        state=habitation.state,
        country="India",
        geom="SRID=4326;POINT(77.65 12.99)",
        capacity_total=2000,
        capacity_available=2000,
        risk_score=30.0,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add_all([insufficient, eligible])
    db_session.flush()

    for destination, usable, required in (
        (insufficient, 100, habitation.population),
        (eligible, 2000, habitation.population),
    ):
        db_session.add(CapacityAssessment(
            destination_id=destination.id,
            habitation_id=habitation.id,
            nominal_capacity=destination.capacity_total,
            existing_occupancy=0,
            water_constraint=0,
            sanitation_constraint=0,
            safety_reserve=0,
            required_capacity=required,
            usable_capacity=usable,
            capacity_gap=usable - required,
            status="ELIGIBLE" if usable >= required else "INSUFFICIENT",
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        ))
    db_session.commit()
    return {"habitation": habitation, "hazard": hazard, "eligible": eligible, "insufficient": insufficient}
