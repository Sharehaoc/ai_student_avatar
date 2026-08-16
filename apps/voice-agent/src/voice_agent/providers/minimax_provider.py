from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import aiohttp
from livekit.agents import (
    APIConnectionError,
    APIConnectOptions,
    APIError,
    APIStatusError,
    APITimeoutError,
    DEFAULT_API_CONNECT_OPTIONS,
    tts,
    utils,
)

from voice_agent.providers.base import ProviderHealth, VoiceSessionContext
from voice_agent.providers.minimax_protocol import (
    MiniMaxSseDecoder,
    build_audio_settings,
    build_t2a_payload,
    payload_audio,
    payload_status_code,
    select_minimax_runtime,
)
from voice_agent.tts.segmenter import SafeTTSStreamSegmenter, TTSSegmentDecision
from voice_agent.tts.text_pipeline import prepare_tts_segment


@dataclass(frozen=True, slots=True)
class MiniMaxOptions:
    api_key: str
    group_id: str
    api_host: str
    ws_url: str
    voice_id: str
    model: str
    runtime: str
    pronunciation_fixes: dict[str, str]
    use_simplified_glyphs: bool
    volume: float
    sample_rate: int = 24_000


class MiniMaxProvider:
    name = "minimax"

    def __init__(
        self,
        *,
        api_key: str,
        group_id: str,
        api_host: str,
        ws_url: str,
        runtime: str,
        volume: float,
        use_simplified_glyphs: bool,
    ) -> None:
        self._api_key = api_key
        self._group_id = group_id
        self._api_host = api_host
        self._ws_url = ws_url
        self._runtime = runtime
        self._volume = volume
        self._use_simplified_glyphs = use_simplified_glyphs

    def create(self, context: VoiceSessionContext):
        return MiniMaxTTS(
            MiniMaxOptions(
                api_key=self._api_key,
                group_id=self._group_id,
                api_host=self._api_host,
                ws_url=self._ws_url,
                voice_id=context.voice_id,
                model=context.voice_model,
                runtime=select_minimax_runtime(context.voice_model, self._runtime),
                volume=self._volume,
                pronunciation_fixes=dict(context.pronunciation_fixes),
                use_simplified_glyphs=self._use_simplified_glyphs,
            )
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            kind="TTS",
            provider=self.name,
            status="UNKNOWN",
            checked_at=datetime.now(timezone.utc).isoformat(),
            code="NO_RECENT_PROBE",
        )


class MiniMaxTTS(tts.TTS):
    _semaphore: asyncio.Semaphore | None = None
    _last_http_call = 0.0
    _minimum_http_interval = 0.5

    def __init__(self, options: MiniMaxOptions) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=options.sample_rate,
            num_channels=1,
        )
        self._options = options
        self._session: aiohttp.ClientSession | None = None

    @classmethod
    def _http_semaphore(cls) -> asyncio.Semaphore:
        if cls._semaphore is None:
            cls._semaphore = asyncio.Semaphore(1)
        return cls._semaphore

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=35, connect=5, sock_read=30)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    @property
    def model(self) -> str:
        return self._options.model

    @property
    def provider(self) -> str:
        return "MiniMax"

    @property
    def runtime(self) -> str:
        return self._options.runtime

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "MiniMaxChunkedStream":
        return MiniMaxChunkedStream(
            tts_instance=self,
            input_text=text,
            options=self._options,
            session=self._ensure_session(),
            conn_options=conn_options,
        )

    def stream(
        self,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.SynthesizeStream:
        stream_class = (
            MiniMaxWebSocketStream
            if self._options.runtime == "ws"
            else MiniMaxHttpStream
        )
        return stream_class(
            tts_instance=self,
            options=self._options,
            session=self._ensure_session(),
            conn_options=replace(conn_options, max_retry=5),
        )

    async def aclose(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()


def _prepared_segment(options: MiniMaxOptions, text: str) -> str:
    return prepare_tts_segment(
        text,
        pronunciation_fixes=options.pronunciation_fixes,
        use_simplified_glyphs=options.use_simplified_glyphs,
    )


def _http_url(options: MiniMaxOptions) -> str:
    url = f"{options.api_host}/v1/t2a_v2"
    group_id = quote(options.group_id, safe="")
    return f"{url}?GroupId={group_id}" if group_id else url


def _headers(options: MiniMaxOptions) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {options.api_key}",
        "Content-Type": "application/json",
    }


async def _stream_http_audio(
    *,
    session: aiohttp.ClientSession,
    options: MiniMaxOptions,
    text: str,
    push: Any,
) -> int:
    payload = build_t2a_payload(
        text=text,
        voice_id=options.voice_id,
        model=options.model,
        sample_rate=options.sample_rate,
        volume=options.volume,
    )
    try:
        async with session.post(
            _http_url(options),
            json=payload,
            headers=_headers(options),
        ) as response:
            if response.status != 200:
                raise APIStatusError(
                    "MiniMax TTS HTTP request failed",
                    status_code=response.status,
                )
            decoder = MiniMaxSseDecoder()
            total_bytes = 0
            async for chunk in response.content.iter_any():
                for audio in decoder.feed(chunk):
                    push(audio)
                    total_bytes += len(audio)
            for audio in decoder.finish():
                push(audio)
                total_bytes += len(audio)
            return total_bytes
    except asyncio.TimeoutError as error:
        raise APITimeoutError("MiniMax TTS request timed out") from error
    except aiohttp.ClientError as error:
        raise APIConnectionError("MiniMax TTS connection failed") from error
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        raise APIError("MiniMax TTS returned an invalid stream", retryable=False) from error


async def _throttled_http_audio(
    *,
    session: aiohttp.ClientSession,
    options: MiniMaxOptions,
    text: str,
    push: Any,
) -> int:
    async with MiniMaxTTS._http_semaphore():
        elapsed = time.monotonic() - MiniMaxTTS._last_http_call
        if elapsed < MiniMaxTTS._minimum_http_interval:
            await asyncio.sleep(MiniMaxTTS._minimum_http_interval - elapsed)
        MiniMaxTTS._last_http_call = time.monotonic()
        total = await _stream_http_audio(
            session=session,
            options=options,
            text=text,
            push=push,
        )
        if total == 0:
            await asyncio.sleep(0.5)
            MiniMaxTTS._last_http_call = time.monotonic()
            total = await _stream_http_audio(
                session=session,
                options=options,
                text=text,
                push=push,
            )
        if total == 0:
            raise APIError("MiniMax TTS returned no audio")
        return total


class MiniMaxChunkedStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts_instance: MiniMaxTTS,
        input_text: str,
        options: MiniMaxOptions,
        session: aiohttp.ClientSession,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(
            tts=tts_instance,
            input_text=input_text,
            conn_options=conn_options,
        )
        self._options = options
        self._session = session

    async def _run(self, output_emitter) -> None:
        prepared = _prepared_segment(self._options, self._input_text)
        if not prepared:
            return
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._options.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
        )
        await _throttled_http_audio(
            session=self._session,
            options=self._options,
            text=prepared,
            push=output_emitter.push,
        )
        output_emitter.flush()


class _MiniMaxStreamingBase(tts.SynthesizeStream):
    def __init__(
        self,
        *,
        tts_instance: MiniMaxTTS,
        options: MiniMaxOptions,
        session: aiohttp.ClientSession,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts_instance, conn_options=conn_options)
        self._options = options
        self._session = session

    async def _iter_decisions(self):
        segmenter = SafeTTSStreamSegmenter()
        async for item in self._input_ch:
            if isinstance(item, self._FlushSentinel):
                for decision in segmenter.finish():
                    yield decision
                continue
            for decision in segmenter.feed(str(item)):
                yield decision
        for decision in segmenter.finish():
            yield decision


class MiniMaxHttpStream(_MiniMaxStreamingBase):
    async def _run(self, output_emitter) -> None:
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._options.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
            stream=True,
        )
        output_emitter.start_segment(segment_id=utils.shortuuid())
        async for decision in self._iter_decisions():
            prepared = _prepared_segment(self._options, decision.text)
            if not prepared:
                continue
            self._mark_started()
            await _throttled_http_audio(
                session=self._session,
                options=self._options,
                text=prepared,
                push=output_emitter.push,
            )
        output_emitter.flush()
        output_emitter.end_segment()


class MiniMaxWebSocketStream(_MiniMaxStreamingBase):
    async def _run(self, output_emitter) -> None:
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._options.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
            stream=True,
        )
        output_emitter.start_segment(segment_id=utils.shortuuid())
        try:
            async with self._session.ws_connect(
                self._options.ws_url,
                headers={"Authorization": f"Bearer {self._options.api_key}"},
                heartbeat=30,
            ) as websocket:
                await self._run_socket(websocket, output_emitter)
        except asyncio.TimeoutError as error:
            raise APITimeoutError("MiniMax TTS WebSocket timed out") from error
        except aiohttp.ClientError as error:
            raise APIConnectionError("MiniMax TTS WebSocket connection failed") from error

    async def _run_socket(self, websocket, output_emitter) -> None:
        initial = await websocket.receive(timeout=10)
        if initial.type in {
            aiohttp.WSMsgType.ERROR,
            aiohttp.WSMsgType.CLOSE,
            aiohttp.WSMsgType.CLOSED,
        }:
            raise APIConnectionError("MiniMax TTS WebSocket closed before start")
        if initial.type == aiohttp.WSMsgType.TEXT:
            self._validate_ws_payload(initial.data)

        await websocket.send_json({
            "event": "task_start",
            "model": self._options.model,
            **build_audio_settings(
                voice_id=self._options.voice_id,
                sample_rate=self._options.sample_rate,
                volume=self._options.volume,
            ),
        })
        await self._wait_until_started(websocket)

        input_sent = asyncio.Event()
        finish_sent = asyncio.Event()
        total_bytes = 0

        async def send_text() -> None:
            async for decision in self._iter_decisions():
                prepared = _prepared_segment(self._options, decision.text)
                if not prepared:
                    continue
                self._mark_started()
                await websocket.send_json({"event": "task_continue", "text": prepared})
                input_sent.set()
            await websocket.send_json({"event": "task_finish"})
            finish_sent.set()
            input_sent.set()

        async def receive_audio() -> None:
            nonlocal total_bytes
            await input_sent.wait()
            while True:
                try:
                    message = await websocket.receive(timeout=30)
                except asyncio.TimeoutError:
                    if finish_sent.is_set() and total_bytes == 0:
                        raise APITimeoutError("MiniMax TTS WebSocket returned no audio") from None
                    if finish_sent.is_set():
                        break
                    continue
                if message.type == aiohttp.WSMsgType.BINARY:
                    output_emitter.push(message.data)
                    total_bytes += len(message.data)
                    continue
                if message.type == aiohttp.WSMsgType.TEXT:
                    payload = self._validate_ws_payload(message.data)
                    audio = payload_audio(payload)
                    if audio:
                        output_emitter.push(audio)
                        total_bytes += len(audio)
                    if str(payload.get("event", "")).lower() in {"task_finished", "finished"}:
                        break
                    continue
                if message.type in {
                    aiohttp.WSMsgType.ERROR,
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                }:
                    if total_bytes == 0:
                        raise APIConnectionError("MiniMax TTS WebSocket closed without audio")
                    break

        tasks = [asyncio.create_task(send_text()), asyncio.create_task(receive_audio())]
        try:
            await asyncio.gather(*tasks)
        finally:
            input_sent.set()
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        if total_bytes == 0:
            raise APIError("MiniMax TTS WebSocket returned no audio")
        output_emitter.flush()
        output_emitter.end_segment()

    @staticmethod
    def _validate_ws_payload(raw: str) -> dict[str, Any]:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as error:
            raise APIError("MiniMax TTS WebSocket returned invalid JSON", retryable=False) from error
        if not isinstance(payload, dict):
            raise APIError("MiniMax TTS WebSocket returned invalid payload", retryable=False)
        status_code = payload_status_code(payload)
        if status_code != 0:
            raise APIError(f"MiniMax TTS provider status {status_code}")
        return payload

    async def _wait_until_started(self, websocket) -> None:
        deadline = asyncio.get_running_loop().time() + 10
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                break
            message = await websocket.receive(timeout=remaining)
            if message.type != aiohttp.WSMsgType.TEXT:
                if message.type in {
                    aiohttp.WSMsgType.ERROR,
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                }:
                    break
                continue
            payload = self._validate_ws_payload(message.data)
            if str(payload.get("event", "")).lower() in {"task_started", "started"}:
                return
        raise APIConnectionError("MiniMax TTS WebSocket did not start")
