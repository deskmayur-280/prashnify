# syntax=docker/dockerfile:1
ARG PYTHON_VERSION=3.12
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONOPTIMIZE=1

WORKDIR /app

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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

USER appuser
COPY . .

EXPOSE 8000

CMD uvicorn server:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --timeout-keep-alive 75 \
    --ws-ping-interval 20 \
    --ws-ping-timeout 45 \
    --workers 1 \
    --loop uvloop \
    --log-level warning
