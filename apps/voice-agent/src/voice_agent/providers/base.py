from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Literal, Protocol


_BLOCKED_VOICE_IDS = frozenset({
    "placeholder",
    "replace-me",
    "student-voice-clone",
    "your-voice-id",
})


@dataclass(frozen=True)
class VoiceSessionContext:
    tenant_id: str
    conversation_id: str
    visitor_user_id: str
    persona_version_id: str
    system_prompt: str
    opening_message: str
    voice_id: str
    voice_model: str
    max_duration_seconds: int
    pronunciation_fixes: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for field_name, value in self.__dict__.items():
            if field_name == "pronunciation_fixes":
                continue
            if not str(value).strip():
                raise ValueError(f"{field_name} must not be empty")
        if self.voice_id.strip().lower() in _BLOCKED_VOICE_IDS:
            raise ValueError("voice_id must be a configured provider voice")
        if (
            isinstance(self.max_duration_seconds, bool)
            or not isinstance(self.max_duration_seconds, int)
            or self.max_duration_seconds <= 0
        ):
            raise ValueError("max_duration_seconds must be a positive integer")
        cleaned_fixes: dict[str, str] = {}
        for raw_text, raw_pronunciation in self.pronunciation_fixes.items():
            text = str(raw_text).strip()
            pronunciation = str(raw_pronunciation).strip()
            if not text or not pronunciation:
                raise ValueError("pronunciation fixes must not contain empty text")
            cleaned_fixes[text] = pronunciation
        object.__setattr__(
            self,
            "pronunciation_fixes",
            MappingProxyType(cleaned_fixes),
        )


@dataclass(frozen=True)
class ProviderHealth:
    kind: Literal["STT", "LLM", "TTS"]
    provider: str
    status: Literal["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"]
    checked_at: str
    latency_ms: float | None = None
    code: str | None = None


class STTProvider(Protocol):
    name: str

    def create(self, context: VoiceSessionContext) -> Any:
        """Create the STT runtime consumed by the session orchestrator."""

    async def health(self) -> ProviderHealth:
        """Return evidence-backed provider health."""


class LLMProvider(Protocol):
    name: str

    def create(self, context: VoiceSessionContext) -> Any:
        """Create the LLM runtime consumed by the session orchestrator."""

    async def health(self) -> ProviderHealth:
        """Return evidence-backed provider health."""


class TTSProvider(Protocol):
    name: str

    def create(self, context: VoiceSessionContext) -> Any:
        """Create the TTS runtime consumed by the session orchestrator."""

    async def health(self) -> ProviderHealth:
        """Return evidence-backed provider health."""
