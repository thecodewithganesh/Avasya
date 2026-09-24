FROM python:3.14-slim

WORKDIR /app

# Build context is the repository root (docker-compose build context: .),
# so backend package, alembic.ini and database/migrations are addressed
# relative to that root.
COPY backend/requirements.txt ./requirements.txt
# Optional ML flavor: --build-arg EMBEDDING_FLAVOR=ml adds torch +
# sentence-transformers (multi-GB). The slim default runs the RAG pipeline
# with the NullEmbedder stub and stays ~10x smaller.
ARG EMBEDDING_FLAVOR=slim
COPY backend/requirements-ml.txt ./requirements-ml.txt
RUN if [ "$EMBEDDING_FLAVOR" = "ml" ]; then pip install --no-cache-dir -r requirements-ml.txt; fi \
    && pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./alembic.ini
# Some checkouts keep Alembic files under scripts/database instead of a
# repository-root database directory.
COPY scripts/database ./database
COPY backend ./backend
# Decision engines + LLM teammate module (ai/llm), adapted by
# backend/integrations/llm_client.py. Copied as a whole package — a previous
# selective COPY overwrote ai/llm/__init__.py and broke the ai.llm import
# inside the image. Inference stays unconfigured in-container unless model
# paths are mounted or AVASYA_LLM_SERVER_URL points at the llama-server
# profile container.
COPY ai ./ai

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
