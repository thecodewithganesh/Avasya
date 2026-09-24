from __future__ import annotations

from collections.abc import Generator

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


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
