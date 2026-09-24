from __future__ import annotations

from collections.abc import Generator

from geoalchemy2.elements import WKTElement
from sqlalchemy import Text, create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=not settings.DATABASE_URL.startswith("sqlite"),
    connect_args=connect_args,
    future=True,
)

if settings.DATABASE_URL.startswith("sqlite"):
    @sa_event.listens_for(engine, "connect")
    def _register_sqlite_functions(dbapi_conn, _record):
        dbapi_conn.create_function("char_length", 1, lambda s: len(s) if s is not None else 0)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def init_db_schema() -> None:
    if settings.DATABASE_URL.startswith("sqlite"):
        from geoalchemy2 import Geometry
        from pgvector.sqlalchemy import Vector
        from backend.models import Base

        for table in Base.metadata.tables.values():
            for column in table.columns:
                if isinstance(column.type, (Geometry, Vector)):
                    column.type = Text()
        Base.metadata.create_all(bind=engine)


def make_wkt_element(wkt_string: str, srid: int = 4326) -> Any:
    elem = WKTElement(wkt_string, srid=srid)
    if settings.DATABASE_URL.startswith("sqlite"):
        return str(elem.data) if hasattr(elem, "data") else str(wkt_string)
    return elem


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

