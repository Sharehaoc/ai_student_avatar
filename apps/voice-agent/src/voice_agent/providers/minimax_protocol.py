from __future__ import annotations

import json
from typing import Any, Literal


def select_minimax_runtime(
    model: str,
    configured: str,
) -> Literal["http", "ws"]:
    normalized = configured.strip().lower()
    if normalized in {"http", "ws"}:
        return normalized  # type: ignore[return-value]
    if normalized != "auto":
        raise ValueError("MiniMax runtime must be auto, http, or ws")
    return "ws" if model.startswith("speech-2.6") else "http"


def build_audio_settings(
    *,
    voice_id: str,
    sample_rate: int,
    speed: float = 1.0,
    volume: float = 1.0,
    pitch: int = 0,
) -> dict[str, Any]:
    return {
        "voice_setting": {
            "voice_id": voice_id,
            "speed": float(speed),
            "vol": float(volume),
            "pitch": int(pitch),
        },
        "audio_setting": {
            "sample_rate": int(sample_rate),
            "format": "pcm",
            "channel": 1,
        },
    }


def build_t2a_payload(
    *,
    text: str,
    voice_id: str,
    model: str,
    sample_rate: int,
) -> dict[str, Any]:
    return {
        "text": text,
        "model": model,
        "stream": True,
        "stream_options": {"exclude_aggregated_audio": True},
        **build_audio_settings(voice_id=voice_id, sample_rate=sample_rate),
    }


def payload_status_code(payload: dict[str, Any]) -> int:
    base_response = payload.get("base_resp")
    if not isinstance(base_response, dict):
        return 0
    value = base_response.get("status_code", 0)
    return int(value) if isinstance(value, (int, float)) else -1


def payload_audio(payload: dict[str, Any]) -> bytes | None:
    data = payload.get("data")
    if not isinstance(data, dict) or data.get("status") == 2:
        return None
    audio_hex = data.get("audio")
    if not isinstance(audio_hex, str) or not audio_hex:
        return None
    try:
        return bytes.fromhex(audio_hex)
    except ValueError as error:
        raise ValueError("MiniMax returned invalid audio encoding") from error


class MiniMaxSseDecoder:
    def __init__(self) -> None:
        self._buffer = b""

    def feed(self, chunk: bytes) -> list[bytes]:
        self._buffer += chunk
        self._buffer = self._buffer.replace(b"\r\n", b"\n")
        audio: list[bytes] = []
        while b"\n\n" in self._buffer:
            event, self._buffer = self._buffer.split(b"\n\n", 1)
            decoded = self._decode_event(event)
            if decoded is not None:
                audio.append(decoded)
        return audio

    def finish(self) -> list[bytes]:
        if not self._buffer.strip():
            self._buffer = b""
            return []
        event = self._buffer
        self._buffer = b""
        decoded = self._decode_event(event)
        return [decoded] if decoded is not None else []

    @staticmethod
    def _decode_event(event: bytes) -> bytes | None:
        line = event.decode("utf-8", errors="strict").strip()
        if not line.startswith("data:"):
            return None
        payload = json.loads(line[5:].strip())
        if not isinstance(payload, dict):
            raise ValueError("MiniMax SSE payload must be an object")
        status_code = payload_status_code(payload)
        if status_code != 0:
            raise ValueError(f"MiniMax provider status {status_code}")
        return payload_audio(payload)
