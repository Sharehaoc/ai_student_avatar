from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from dotenv import find_dotenv, load_dotenv
from livekit.plugins import openai, silero, soniox

from voice_agent.core_client import CoreApiClient
from voice_agent.orchestrator import VoiceSessionOrchestrator
from voice_agent.runtime_config import VoiceAgentEnvironment
from voice_agent.runtime_metadata import DispatchMetadata
from voice_agent.tts.stream_filters import safety_filter
from voice_agent.tts.text_pipeline import (
    normalize_taiwan_spoken_text,
    to_taiwan_traditional,
)


logger = logging.getLogger("voice_agent.worker")
PIPELINE_EVENT_TOPIC = "flying-eagle.pipeline"


@dataclass(slots=True)
class SessionOutcome:
    active: bool = False
    error_seen: bool = False

    def mark_active(self) -> None:
        self.active = True

    def mark_error(self) -> None:
        self.error_seen = True

    def mark_visitor_disconnected(self) -> None:
        pass

    @property
    def final_state(self) -> str:
        return "FAILED" if self.error_seen or not self.active else "ENDED"


def pipeline_error_payload(stage: str) -> dict[str, Any]:
    if stage not in {"STT", "LLM", "TTS"}:
        raise ValueError("invalid pipeline stage")
    return {
        "version": 1,
        "type": "PIPELINE_ERROR",
        "stage": stage,
        "code": f"{stage}_FAILED",
    }


def pipeline_status_payload(stage: str, status: str) -> dict[str, Any]:
    if stage not in {"STT", "LLM", "TTS"} or status != "success":
        raise ValueError("invalid pipeline status")
    return {
        "version": 1,
        "type": "PIPELINE_STATUS",
        "stage": stage,
        "status": status,
    }


def resolve_pipeline_stage(source: Any, runtime: Any) -> str | None:
    for stage, component in (
        ("STT", runtime.stt),
        ("LLM", runtime.llm),
        ("TTS", runtime.tts),
    ):
        if source is component:
            return stage
    return None


def build_message_event(room_name: str, item: Any) -> dict[str, Any] | None:
    role = str(getattr(item, "role", "")).lower()
    if role not in {"user", "assistant"}:
        return None
    text = str(getattr(item, "text_content", "") or "").strip()
    if not text:
        return None
    item_id = str(getattr(item, "id", "")).strip()
    if not item_id:
        return None
    created_at = float(getattr(item, "created_at", 0) or 0)
    if created_at <= 0:
        created_at = datetime.now(timezone.utc).timestamp()
    digest = hashlib.sha256(f"{room_name}:{item_id}".encode("utf-8")).hexdigest()
    return {
        "eventId": f"voice-{digest}",
        "turnId": item_id[:128],
        "role": role.upper(),
        "text": normalize_taiwan_spoken_text(to_taiwan_traditional(text)).strip(),
        "occurredAt": datetime.fromtimestamp(created_at, timezone.utc).isoformat(),
    }


def safe_turn_metrics(item: Any) -> dict[str, float]:
    metrics = getattr(item, "metrics", None)
    if not isinstance(metrics, dict):
        return {}
    fields = {
        "transcription_delay": "transcription_delay",
        "end_of_turn_delay": "end_of_turn_delay",
        "llm_node_ttft": "llm_ttft",
        "tts_node_ttfb": "tts_ttfb",
        "e2e_latency": "e2e_latency",
    }
    safe: dict[str, float] = {}
    for source, target in fields.items():
        value = metrics.get(source)
        if (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        ):
            safe[target] = round(float(value), 4)
    return safe


def is_session_participant(expected_identity: str, participant: Any) -> bool:
    return str(getattr(participant, "identity", "")).strip() == expected_identity


def _prewarm(process) -> None:
    process.userdata["vad"] = silero.VAD.load(
        min_silence_duration=1.2,
        prefix_padding_duration=0.3,
        min_speech_duration=0.3,
        activation_threshold=0.65,
    )


async def voice_agent_entrypoint(job_context) -> None:
    from livekit.agents import Agent, AgentSession, room_io

    environment = VoiceAgentEnvironment.from_environment()
    core = CoreApiClient(
        base_url=environment.core_api_url,
        internal_token=environment.voice_internal_token,
    )
    metadata: DispatchMetadata | None = None
    session = None
    runtime = None
    write_tasks: set[asyncio.Task[Any]] = set()
    outcome = SessionOutcome()
    watchdog: asyncio.Task[None] | None = None

    async def close_runtime(reason: str = "") -> None:
        nonlocal watchdog
        if watchdog is not None:
            watchdog.cancel()
            await asyncio.gather(watchdog, return_exceptions=True)
            watchdog = None
        if write_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tuple(write_tasks), return_exceptions=True),
                    timeout=5,
                )
            except asyncio.TimeoutError:
                logger.warning("transcript flush timed out")
        if metadata is not None:
            final_state = outcome.final_state
            try:
                await core.transition_state(metadata.conversation_id, final_state)
            except Exception as error:
                logger.error(
                    "voice finalization failed type=%s reason=%s",
                    type(error).__name__,
                    reason or "unknown",
                )
        if runtime is not None:
            for component in (runtime.tts, runtime.llm, runtime.stt):
                close = getattr(component, "aclose", None)
                if close is not None:
                    try:
                        await close()
                    except Exception:
                        logger.warning("provider close failed type=%s", type(component).__name__)
        await core.aclose()

    job_context.add_shutdown_callback(close_runtime)

    try:
        if not str(job_context.room.name).startswith("eagle-"):
            raise ValueError("voice room namespace is invalid")

        await job_context.connect()
        participant = await job_context.wait_for_participant()
        participant_metadata = DispatchMetadata.from_json(participant.metadata)
        dispatch_metadata = DispatchMetadata.from_json(job_context.job.metadata)
        participant_metadata.assert_matches(dispatch_metadata)
        metadata = participant_metadata
        job_context.log_context_fields = {
            "conversation_id": metadata.conversation_id,
            "room": job_context.room.name,
        }

        context = await core.fetch_context(metadata)

        @job_context.room.on("participant_disconnected")
        def on_participant_disconnected(disconnected_participant) -> None:
            if not is_session_participant(participant.identity, disconnected_participant):
                return
            outcome.mark_visitor_disconnected()
            if session is not None:
                session.shutdown(drain=False)
            job_context.shutdown("visitor disconnected")

        from voice_agent.providers.minimax_provider import MiniMaxProvider
        from voice_agent.providers.openai_provider import OpenAIProvider
        from voice_agent.providers.soniox_provider import SonioxProvider

        orchestrator = VoiceSessionOrchestrator(
            stt=SonioxProvider(
                api_key=environment.soniox_api_key,
                enable_speaker_diarization=environment.soniox_speaker_diarization,
            ),
            llm=OpenAIProvider(
                api_key=environment.openai_api_key,
                model=environment.openai_model,
            ),
            tts=MiniMaxProvider(
                api_key=environment.minimax_api_key,
                group_id=environment.minimax_group_id,
                api_host=environment.minimax_api_host,
                ws_url=environment.minimax_ws_url,
                runtime=environment.minimax_runtime,
                use_simplified_glyphs=environment.minimax_simplified_glyphs,
            ),
        )
        runtime = orchestrator.build_runtime(context)
        vad = job_context.proc.userdata.get("vad") or silero.VAD.load(
            min_silence_duration=1.2,
            prefix_padding_duration=0.3,
            min_speech_duration=0.3,
            activation_threshold=0.65,
        )

        session = AgentSession(
            stt=runtime.stt,
            llm=runtime.llm,
            tts=runtime.tts,
            vad=vad,
            turn_handling={"interruption": {"min_duration": 1.0}},
            tts_text_transforms=["filter_markdown", "filter_emoji", safety_filter],
        )

        def schedule_write(payload: dict[str, Any]) -> None:
            task = asyncio.create_task(
                core.append_message(context.conversation_id, payload)
            )
            write_tasks.add(task)

            def done(completed: asyncio.Task[Any]) -> None:
                write_tasks.discard(completed)
                if completed.cancelled():
                    return
                error = completed.exception()
                if error is not None:
                    logger.error("transcript write failed type=%s", type(error).__name__)

            task.add_done_callback(done)

        def schedule_pipeline_event(event_payload: dict[str, Any]) -> None:
            payload = json.dumps(
                event_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            task = asyncio.create_task(job_context.room.local_participant.publish_data(
                payload,
                reliable=True,
                topic=PIPELINE_EVENT_TOPIC,
            ))
            write_tasks.add(task)

            def done(completed: asyncio.Task[Any]) -> None:
                write_tasks.discard(completed)
                if completed.cancelled():
                    return
                error = completed.exception()
                if error is not None:
                    logger.warning("pipeline event publish failed type=%s", type(error).__name__)

            task.add_done_callback(done)

        @session.on("conversation_item_added")
        def on_conversation_item(event) -> None:
            payload = build_message_event(job_context.room.name, event.item)
            if payload is not None:
                schedule_write(payload)
                logger.info(
                    "voice turn added role=%s metrics=%s",
                    payload["role"],
                    json.dumps(
                        safe_turn_metrics(event.item),
                        ensure_ascii=True,
                        separators=(",", ":"),
                    ),
                )

        @session.on("agent_state_changed")
        def on_agent_state_changed(event) -> None:
            if event.old_state == "speaking" and event.new_state != "speaking":
                schedule_pipeline_event(pipeline_status_payload("TTS", "success"))

        @session.on("error")
        def on_error(event) -> None:
            outcome.mark_error()
            stage = resolve_pipeline_stage(event.source, runtime)
            if stage is not None:
                schedule_pipeline_event(pipeline_error_payload(stage))
            logger.error(
                "voice session error source=%s type=%s",
                type(event.source).__name__,
                type(event.error).__name__,
            )

        @session.on("close")
        def on_close(event) -> None:
            reason = getattr(event.reason, "value", str(event.reason)).lower()
            if getattr(event, "error", None) is not None or reason == "error":
                outcome.mark_error()

        agent = Agent(instructions=context.system_prompt)
        await session.start(
            room=job_context.room,
            agent=agent,
            room_options=room_io.RoomOptions(close_on_disconnect=False),
        )
        await core.transition_state(context.conversation_id, "ACTIVE")
        outcome.mark_active()

        async def enforce_duration_limit() -> None:
            await asyncio.sleep(context.max_duration_seconds)
            if session is not None:
                session.shutdown(drain=False)
            job_context.shutdown("voice duration limit reached")

        watchdog = asyncio.create_task(
            enforce_duration_limit(),
            name="voice-duration-limit",
        )

        opening = session.say(
            context.opening_message,
            allow_interruptions=True,
            add_to_chat_ctx=True,
        )
        try:
            await asyncio.wait_for(opening.wait_for_playout(), timeout=8)
        except asyncio.TimeoutError:
            logger.warning("opening playout exceeded eight seconds; session remains active")
    except Exception:
        outcome.mark_error()
        await close_runtime("entrypoint failure")
        raise


def run_worker() -> None:
    from livekit.agents import WorkerOptions, cli

    local_env = find_dotenv(usecwd=True)
    if local_env:
        load_dotenv(local_env, override=False)
    environment = VoiceAgentEnvironment.from_environment()
    from voice_agent.preview_server import VoicePreviewServer

    preview_server = VoicePreviewServer(environment)
    preview_server.start()
    port = int(os.environ.get("LIVEKIT_WORKER_PORT", "8081"))
    try:
        cli.run_app(WorkerOptions(
            entrypoint_fnc=voice_agent_entrypoint,
            prewarm_fnc=_prewarm,
            agent_name=environment.livekit_agent_name,
            host=environment.livekit_worker_host,
            port=port,
        ))
    finally:
        preview_server.stop()
