from dataclasses import dataclass
from typing import Any

from voice_agent.providers.base import (
    LLMProvider,
    STTProvider,
    TTSProvider,
    VoiceSessionContext,
)


@dataclass(frozen=True)
class VoiceRuntimeComponents:
    stt: Any
    llm: Any
    tts: Any


class VoiceSessionOrchestrator:
    """Compose one voice session without importing provider implementations."""

    def __init__(self, *, stt: STTProvider, llm: LLMProvider, tts: TTSProvider):
        self._stt = stt
        self._llm = llm
        self._tts = tts

    def build_runtime(self, context: VoiceSessionContext) -> VoiceRuntimeComponents:
        return VoiceRuntimeComponents(
            stt=self._stt.create(context),
            llm=self._llm.create(context),
            tts=self._tts.create(context),
        )
