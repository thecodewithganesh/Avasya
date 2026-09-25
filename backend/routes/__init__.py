from .api import router
from .gis import router as gis_router
from .intelligence import router as intelligence_router
from .evidence import router as evidence_router

__all__ = ["router", "gis_router", "intelligence_router", "evidence_router"]
