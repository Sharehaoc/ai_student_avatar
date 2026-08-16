from __future__ import annotations

from datetime import datetime, timezone

from voice_agent.providers.base import ProviderHealth, VoiceSessionContext


class SonioxProvider:
    name = "soniox"

    def __init__(self, *, api_key: str, enable_speaker_diarization: bool = True) -> None:
        self._api_key = api_key
        self._enable_speaker_diarization = enable_speaker_diarization

    def create(self, context: VoiceSessionContext):
        from livekit.plugins import soniox

        terms = sorted(context.pronunciation_fixes.keys())
        soniox_context = soniox.ContextObject(terms=terms) if terms else None
        return soniox.STT(
            api_key=self._api_key,
            params=soniox.STTOptions(
                model="stt-rt-v4",
                language_hints=["zh", "en"],
                context=soniox_context,
                enable_speaker_diarization=self._enable_speaker_diarization,
                enable_language_identification=True,
                max_endpoint_delay_ms=800,
            ),
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            kind="STT",
            provider=self.name,
            status="UNKNOWN",
            checked_at=datetime.now(timezone.utc).isoformat(),
            code="NO_RECENT_PROBE",
        )
