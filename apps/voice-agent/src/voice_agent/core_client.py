from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

from voice_agent.providers.base import VoiceSessionContext
from voice_agent.runtime_metadata import DispatchMetadata


_CONTEXT_FIELDS = frozenset({
    "conversationId",
    "tenantId",
    "visitorUserId",
    "personaVersionId",
    "systemPrompt",
    "openingMessage",
    "voice",
    "pronunciationFixes",
    "maxDurationSeconds",
})
_VOICE_FIELDS = frozenset({"provider", "voiceId", "model"})


def _required_string(payload: Mapping[str, Any], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"runtime context {name} must be a non-empty string")
    return value.strip()


def parse_voice_runtime_context(
    raw: object,
    *,
    expected: DispatchMetadata,
) -> VoiceSessionContext:
    if not isinstance(raw, dict) or set(raw) != _CONTEXT_FIELDS:
        raise ValueError("runtime context contains invalid fields")
    voice = raw.get("voice")
    if not isinstance(voice, dict) or set(voice) != _VOICE_FIELDS:
        raise ValueError("runtime context voice contains invalid fields")
    if voice.get("provider") != "minimax":
        raise ValueError("runtime context voice provider must be minimax")
    fixes = raw.get("pronunciationFixes")
    if not isinstance(fixes, dict) or any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in fixes.items()
    ):
        raise ValueError("runtime context pronunciation fixes are invalid")
    max_duration = raw.get("maxDurationSeconds")
    if isinstance(max_duration, bool) or not isinstance(max_duration, int) or max_duration <= 0:
        raise ValueError("runtime context max duration must be a positive integer")

    actual = DispatchMetadata(
        tenant_id=_required_string(raw, "tenantId"),
        conversation_id=_required_string(raw, "conversationId"),
        visitor_user_id=_required_string(raw, "visitorUserId"),
        persona_version_id=_required_string(raw, "personaVersionId"),
    )
    expected.assert_matches(actual)

    return VoiceSessionContext(
        tenant_id=actual.tenant_id,
        conversation_id=actual.conversation_id,
        visitor_user_id=actual.visitor_user_id,
        persona_version_id=actual.persona_version_id,
        system_prompt=_required_string(raw, "systemPrompt"),
        opening_message=_required_string(raw, "openingMessage"),
        voice_id=_required_string(voice, "voiceId"),
        voice_model=_required_string(voice, "model"),
        max_duration_seconds=max_duration,
        pronunciation_fixes=fixes,
    )


class CoreApiError(RuntimeError):
    pass


class CoreApiClient:
    def __init__(self, *, base_url: str, internal_token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._internal_token = internal_token
        self._session: Any = None

    def _headers(self) -> dict[str, str]:
        return {
            "x-voice-internal-token": self._internal_token,
            "content-type": "application/json",
        }

    def _ensure_session(self):
        if self._session is None or self._session.closed:
            import aiohttp

            timeout = aiohttp.ClientTimeout(total=15, connect=5, sock_read=10)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    def _url(self, conversation_id: str, suffix: str) -> str:
        encoded = quote(conversation_id, safe="")
        return f"{self._base_url}/internal/voice/sessions/{encoded}/{suffix}"

    async def fetch_context(
        self,
        metadata: DispatchMetadata,
    ) -> VoiceSessionContext:
        session = self._ensure_session()
        async with session.get(
            self._url(metadata.conversation_id, "context"),
            headers=self._headers(),
        ) as response:
            if response.status != 200:
                raise CoreApiError(f"Core context request failed with HTTP {response.status}")
            payload = await response.json()
        return parse_voice_runtime_context(payload, expected=metadata)

    async def append_message(self, conversation_id: str, message: Mapping[str, Any]) -> int:
        session = self._ensure_session()
        async with session.post(
            self._url(conversation_id, "messages"),
            headers=self._headers(),
            json=dict(message),
        ) as response:
            if response.status not in {200, 201}:
                raise CoreApiError(f"Core message request failed with HTTP {response.status}")
            payload = await response.json()
        sequence = payload.get("sequence") if isinstance(payload, dict) else None
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 0:
            raise CoreApiError("Core message response is invalid")
        return sequence

    async def transition_state(self, conversation_id: str, state: str) -> dict[str, Any]:
        if state not in {"ACTIVE", "ENDED", "FAILED"}:
            raise ValueError("invalid voice runtime state")
        session = self._ensure_session()
        async with session.post(
            self._url(conversation_id, "state"),
            headers=self._headers(),
            json={"state": state},
        ) as response:
            if response.status != 200:
                raise CoreApiError(f"Core state request failed with HTTP {response.status}")
            payload = await response.json()
        if not isinstance(payload, dict) or payload.get("status") != state:
            raise CoreApiError("Core state response is invalid")
        return payload

    async def aclose(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()
