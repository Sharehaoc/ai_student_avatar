# syntax=docker/dockerfile:1

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN useradd --create-home --uid 10001 agent

WORKDIR /app

COPY requirements.lock pyproject.toml ./
COPY src ./src

RUN python -m pip install --requirement requirements.lock \
    && python -m pip install --no-deps .

USER agent

CMD ["flying-eagle-voice-agent", "start"]
