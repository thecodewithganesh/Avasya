from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db
from backend.routes import router as api_router
from backend.routes import evidence_router, gis_router, intelligence_router
from backend.routes.rag_admin import router as rag_admin_router


def _cors_origins() -> list[str]:
    return [
        origin.strip()
        for origin in settings.CORS_ORIGINS.split(",")
        if origin.strip()
    ]


app = FastAPI(title="AVASYA Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
app.include_router(intelligence_router)
app.include_router(gis_router)
app.include_router(evidence_router)
app.include_router(rag_admin_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "AVASYA Backend",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.on_event("startup")
def startup_event():
    if settings.DATABASE_URL.startswith("sqlite"):
        from backend.core.database import engine, init_db_schema

        init_db_schema()

        try:
            from backend.core.database import SessionLocal
            db = SessionLocal()
            has_habs = db.execute(text("SELECT id FROM habitations LIMIT 1")).first()
            if not has_habs:
                import os
                os.environ["AVASYA_ENABLE_SYNTHETIC_DEMO"] = "true"
                from backend.bootstrap_demo import main as bootstrap_main
                from backend.seed_demo import main as seed_main
                bootstrap_main()
                seed_main()
            db.close()
        except Exception:
            pass


@app.exception_handler(SQLAlchemyError)
def database_error_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    # Include the database probe so the frontend status chip (which requires
    # health.database == "ok" to show CONNECTED) reflects the real state.
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError:
        database = "unavailable"
    return {"status": "ok", "database": database}


@app.get("/health/db")
def database_health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok", "database": "ok"}
