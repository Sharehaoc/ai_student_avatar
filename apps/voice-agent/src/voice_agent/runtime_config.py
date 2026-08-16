from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse


MiniMaxRuntime = Literal["auto", "http", "ws"]


def _required(values: Mapping[str, str], name: str) -> str:
    value = str(values.get(name, "")).strip()
    if not value:
        raise ValueError(f"missing required environment variable: {name}")
    return value


def _strict_bool(values: Mapping[str, str], name: str, default: bool) -> bool:
    raw = values.get(name)
    if raw is None or not str(raw).strip():
        return default
    normalized = str(raw).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _secure_url(raw: str, *, name: str, secure_scheme: str) -> str:
    parsed = urlparse(raw)
    is_local_http = (
        secure_scheme == "https"
        and parsed.scheme == "http"
        and parsed.hostname in {"localhost", "127.0.0.1"}
    )
    if parsed.scheme != secure_scheme and not is_local_http:
        raise ValueError(f"{name} must use {secure_scheme.upper()} outside localhost")
    if not parsed.hostname:
        raise ValueError(f"{name} must be an absolute URL")
    return raw.rstrip("/")


@dataclass(frozen=True, slots=True)
class VoiceAgentEnvironment:
    core_api_url: str
    voice_internal_token: str
    livekit_agent_name: str
    livekit_worker_host: str
    soniox_api_key: str
    soniox_speaker_diarization: bool
    openai_api_key: str
    openai_model: str
    minimax_api_key: str
    minimax_group_id: str
    minimax_api_host: str
    minimax_ws_url: str
    minimax_runtime: MiniMaxRuntime
    minimax_simplified_glyphs: bool
    voice_preview_host: str
    voice_preview_port: int

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> "VoiceAgentEnvironment":
        internal_token = _required(values, "VOICE_INTERNAL_TOKEN")
        if len(internal_token) < 32:
            raise ValueError("VOICE_INTERNAL_TOKEN must contain at least 32 characters")

        runtime = str(values.get("MINIMAX_TTS_RUNTIME", "auto")).strip().lower() or "auto"
        if runtime not in {"auto", "http", "ws"}:
            raise ValueError("MINIMAX_TTS_RUNTIME must be auto, http, or ws")

        api_host = str(
            values.get("MINIMAX_API_HOST", "https://api.minimax.io")
        ).strip()
        ws_url = str(
            values.get("MINIMAX_TTS_WS_URL", "wss://api.minimax.io/ws/v1/t2a_v2")
        ).strip()
        preview_host = str(values.get("VOICE_PREVIEW_HOST", "127.0.0.1")).strip()
        if not preview_host:
            raise ValueError("VOICE_PREVIEW_HOST must not be empty")
        try:
            preview_port = int(str(values.get("VOICE_PREVIEW_PORT", "8082")).strip())
        except ValueError as error:
            raise ValueError("VOICE_PREVIEW_PORT must be a valid port") from error
        if preview_port <= 0 or preview_port > 65_535:
            raise ValueError("VOICE_PREVIEW_PORT must be a valid port")

        return cls(
            core_api_url=_secure_url(
                _required(values, "CORE_API_URL"),
                name="CORE_API_URL",
                secure_scheme="https",
            ),
            voice_internal_token=internal_token,
            livekit_agent_name=_required(values, "LIVEKIT_AGENT_NAME"),
            livekit_worker_host=str(
                values.get("LIVEKIT_WORKER_HOST", "127.0.0.1")
            ).strip() or "127.0.0.1",
            soniox_api_key=_required(values, "SONIOX_API_KEY"),
            soniox_speaker_diarization=_strict_bool(
                values,
                "SONIOX_ENABLE_SPEAKER_DIARIZATION",
                True,
            ),
            openai_api_key=_required(values, "OPENAI_API_KEY"),
            openai_model=_required(values, "OPENAI_MODEL"),
            minimax_api_key=_required(values, "MINIMAX_API_KEY"),
            minimax_group_id=str(values.get("MINIMAX_GROUP_ID", "")).strip(),
            minimax_api_host=_secure_url(
                api_host,
                name="MINIMAX_API_HOST",
                secure_scheme="https",
            ),
            minimax_ws_url=_secure_url(
                ws_url,
                name="MINIMAX_TTS_WS_URL",
                secure_scheme="wss",
            ),
            minimax_runtime=runtime,  # type: ignore[arg-type]
            minimax_simplified_glyphs=_strict_bool(
                values,
                "MINIMAX_TTS_SIMPLIFIED_GLYPH",
                True,
            ),
            voice_preview_host=preview_host,
            voice_preview_port=preview_port,
        )

    @classmethod
    def from_environment(cls) -> "VoiceAgentEnvironment":
        return cls.from_mapping(os.environ)
