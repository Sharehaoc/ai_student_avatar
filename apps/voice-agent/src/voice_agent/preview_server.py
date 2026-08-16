from __future__ import annotations

import asyncio
import hmac
import logging
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from aiohttp import web
from livekit import rtc

from voice_agent.providers.base import VoiceSessionContext
from voice_agent.providers.minimax_provider import MiniMaxProvider
from voice_agent.runtime_config import VoiceAgentEnvironment


logger = logging.getLogger("voice_agent.preview")
_BLOCKED_VOICE_IDS = frozenset({
    "placeholder",
    "replace-me",
    "student-voice-clone",
    "your-voice-id",
})


@dataclass(frozen=True, slots=True)
class PreviewPayload:
    text: str
    voice_id: str
    voice_model: str
    pronunciation_fixes: dict[str, str]


def parse_preview_payload(raw: object) -> PreviewPayload:
    if not isinstance(raw, dict) or set(raw) != {"text", "voice", "pronunciationFixes"}:
        raise ValueError("invalid preview fields")
    text = str(raw["text"]).strip()
    voice = raw["voice"]
    fixes = raw["pronunciationFixes"]
    if not text or len(text) > 500:
        raise ValueError("invalid preview text")
    if not isinstance(voice, dict) or set(voice) != {"provider", "voiceId", "model"}:
        raise ValueError("invalid preview voice")
    if voice["provider"] != "minimax":
        raise ValueError("invalid preview provider")
    voice_id = str(voice["voiceId"]).strip()
    voice_model = str(voice["model"]).strip()
    if (
        not voice_id
        or len(voice_id) > 256
        or voice_id.lower() in _BLOCKED_VOICE_IDS
        or not voice_model
        or len(voice_model) > 128
    ):
        raise ValueError("invalid preview voice")
    if not isinstance(fixes, Mapping) or len(fixes) > 100:
        raise ValueError("invalid pronunciation fixes")
    cleaned_fixes: dict[str, str] = {}
    for raw_text, raw_pronunciation in fixes.items():
        source = str(raw_text).strip()
        pronunciation = str(raw_pronunciation).strip()
        if not source or not pronunciation or len(source) > 100 or len(pronunciation) > 100:
            raise ValueError("invalid pronunciation fixes")
        cleaned_fixes[source] = pronunciation
    return PreviewPayload(
        text=text,
        voice_id=voice_id,
        voice_model=voice_model,
        pronunciation_fixes=cleaned_fixes,
    )


async def synthesize_preview(
    environment: VoiceAgentEnvironment,
    payload: PreviewPayload,
) -> bytes:
    provider = MiniMaxProvider(
        api_key=environment.minimax_api_key,
        group_id=environment.minimax_group_id,
        api_host=environment.minimax_api_host,
        ws_url=environment.minimax_ws_url,
        runtime=environment.minimax_runtime,
        volume=environment.minimax_tts_volume,
        use_simplified_glyphs=environment.minimax_simplified_glyphs,
    )
    context = VoiceSessionContext(
        tenant_id="voice-preview",
        conversation_id="voice-preview",
        visitor_user_id="voice-preview",
        persona_version_id="voice-preview",
        system_prompt="voice preview",
        opening_message="voice preview",
        voice_id=payload.voice_id,
        voice_model=payload.voice_model,
        pronunciation_fixes=payload.pronunciation_fixes,
        max_duration_seconds=60,
    )
    runtime = provider.create(context)
    try:
        frames = []
        async with runtime.stream() as stream:
            stream.push_text(payload.text)
            stream.end_input()
            async for event in stream:
                frames.append(event.frame)
        if not frames:
            raise RuntimeError("empty preview audio")
        frame = rtc.combine_audio_frames(frames)
        audio = frame.to_wav_bytes()
        if not audio:
            raise RuntimeError("empty preview audio")
        return audio
    finally:
        await runtime.aclose()


def create_preview_app(environment: VoiceAgentEnvironment) -> web.Application:
    app = web.Application(client_max_size=32 * 1024)

    async def preview(request: web.Request) -> web.Response:
        provided_token = request.headers.get("x-voice-internal-token", "")
        if not hmac.compare_digest(provided_token, environment.voice_internal_token):
            return web.json_response({"error": {"code": "UNAUTHORIZED"}}, status=401)
        try:
            payload = parse_preview_payload(await request.json())
        except (ValueError, TypeError, web.HTTPException):
            return web.json_response({"error": {"code": "INVALID_REQUEST"}}, status=400)
        try:
            audio = await synthesize_preview(environment, payload)
        except Exception as error:
            logger.error("voice preview failed type=%s", type(error).__name__)
            return web.json_response(
                {"error": {"code": "VOICE_PREVIEW_FAILED"}},
                status=502,
            )
        return web.Response(
            body=audio,
            content_type="audio/wav",
            headers={"Cache-Control": "no-store"},
        )

    app.router.add_post("/preview", preview)
    return app


class VoicePreviewServer:
    def __init__(self, environment: VoiceAgentEnvironment) -> None:
        self._environment = environment
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop_event: asyncio.Event | None = None
        self._ready = threading.Event()
        self._error: BaseException | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run,
            name="voice-preview-server",
            daemon=True,
        )
        self._thread.start()
        if not self._ready.wait(timeout=5):
            raise RuntimeError("voice preview server did not start")
        if self._error is not None:
            raise RuntimeError("voice preview server failed to start") from self._error

    def _run(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        runner = web.AppRunner(create_preview_app(self._environment))

        async def serve() -> None:
            self._stop_event = asyncio.Event()
            try:
                await runner.setup()
                site = web.TCPSite(
                    runner,
                    self._environment.voice_preview_host,
                    self._environment.voice_preview_port,
                )
                await site.start()
            except BaseException as error:
                self._error = error
                self._ready.set()
                return
            self._ready.set()
            await self._stop_event.wait()
            await runner.cleanup()

        try:
            loop.run_until_complete(serve())
        finally:
            loop.close()

    def stop(self) -> None:
        if self._loop is not None and self._stop_event is not None:
            self._loop.call_soon_threadsafe(self._stop_event.set)
        if self._thread is not None:
            self._thread.join(timeout=5)
