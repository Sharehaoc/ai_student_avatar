from __future__ import annotations

from datetime import datetime, timezone

from voice_agent.providers.base import ProviderHealth, VoiceSessionContext


class OpenAIProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def create(self, context: VoiceSessionContext):
        del context
        from livekit.plugins import openai

        return openai.LLM(
            api_key=self._api_key,
            model=self._model,
            temperature=0.7,
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            kind="LLM",
            provider=self.name,
            status="UNKNOWN",
            checked_at=datetime.now(timezone.utc).isoformat(),
            code="NO_RECENT_PROBE",
        )
