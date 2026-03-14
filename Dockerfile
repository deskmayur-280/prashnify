# syntax=docker/dockerfile:1
ARG PYTHON_VERSION=3.12
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# FIXED: Reliability — disable assert statements and __debug__ in production
ENV PYTHONOPTIMIZE=1

WORKDIR /app

# Install system deps for motor/pymongo
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser

RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    python -m pip install -r requirements.txt

USER appuser
COPY . .

EXPOSE 8000

# Railway injects PORT automatically; fall back to 8000
# Use shell form so $PORT expands at runtime
# --workers 1: WebSocket rooms are in-memory, multiple workers would split state
# FIXED: Bug 5 — this CMD is the single source of truth (no startCommand in railway.toml)
# FIXED: --log-level warning to reduce I/O pressure under load
CMD uvicorn server:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --timeout-keep-alive 75 \
    --ws-ping-interval 20 \
    --ws-ping-timeout 45 \
    --workers 1 \
    --loop uvloop \
    --log-level warning
