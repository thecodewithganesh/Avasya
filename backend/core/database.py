from __future__ import annotations

from collections.abc import Generator
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import JSON, Text, create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False


def _flatten_sqlite_types() -> None:
    """Render PostGIS/pgvector column types for the SQLite dev/test stack.

    Geometry -> Text (SRID WKT strings) and Vector -> JSON (float lists).
    Without this, geoalchemy2's Geometry result processor tries to unhexlify the
    stored SRID WKT text and the pgvector type cannot bind Python lists on
    SQLite (psycopg is absent), so RAG indexing would crash on insert.
    Production schema comes from the Alembic/PostGIS+pgvector migration, never
    create_all, and keeps the native types.
    """
    from geoalchemy2 import Geometry
    from pgvector.sqlalchemy import Vector
    from backend.models import Base

    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, (Geometry, Vector)):
                column.type = JSON() if isinstance(column.type, Vector) else Text()


# Flatten BEFORE any ORM use when on the SQLite dev stack. Importing backend.models
# from inside _flatten_sqlite_types is safe here: models never import this module
# at module scope (they import backend.models.base only).
_IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")
if _IS_SQLITE:
    _flatten_sqlite_types()

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=not _IS_SQLITE,
    connect_args=connect_args,
    future=True,
)

if _IS_SQLITE:
    @sa_event.listens_for(engine, "connect")
    def _register_sqlite_functions(dbapi_conn, _record):
        dbapi_conn.create_function("char_length", 1, lambda s: len(s) if s is not None else 0)
        dbapi_conn.create_function("json_extract", 2, lambda v, path: None)
        # PostGIS column renderings under the SQLite dev/test stack: geometry
        # columns are stored as SRID-prefixed WKT text, so geoalchemy2's
        # AsEWKB/GeomFromEWKT SQL functions must resolve to pass-throughs for
        # any ORM round-trip outside FastAPI request scope.
        dbapi_conn.create_function("AsEWKB", 1, lambda g: g)
        dbapi_conn.create_function("GeomFromEWKT", 1, lambda w: w)
        dbapi_conn.create_function("ST_GeomFromEWKT", 1, lambda w: w)
        dbapi_conn.create_function("ST_AsEWKB", 1, lambda g: g)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def init_db_schema() -> None:
    if _IS_SQLITE:
        from backend.models import Base

        Base.metadata.create_all(bind=engine)


def make_wkt_element(wkt_string: str, srid: int = 4326) -> Any:
    elem = WKTElement(wkt_string, srid=srid)
    if _IS_SQLITE:
        return str(elem.data) if hasattr(elem, "data") else str(wkt_string)
    return elem


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
