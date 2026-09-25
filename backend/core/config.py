from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if value:
        return value

    if not os.getenv("PYTEST_CURRENT_TEST"):
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("DATABASE_URL=") and not line.startswith("#"):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        return val

    raise RuntimeError(
        "DATABASE_URL is required. Set it to the local PostgreSQL URL, "
        "for example: postgresql+psycopg://USER:PASSWORD@localhost:5432/avasya"
    )


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str = _database_url()
    DB_ECHO: bool = os.getenv("DB_ECHO", "false").lower() == "true"
    POSTGIS_SRID: int = int(os.getenv("POSTGIS_SRID", "4326"))
    APP_ENV: str = os.getenv("APP_ENV", "development")
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001",
    )
    PORT: int = int(os.getenv("PORT", "58000"))


settings = Settings()

