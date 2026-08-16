import unittest
from types import SimpleNamespace

from voice_agent.worker import (
    SessionOutcome,
    build_message_event,
    is_session_participant,
    pipeline_error_payload,
    pipeline_status_payload,
    safe_turn_metrics,
)


class FakeChatMessage:
    def __init__(
        self,
        *,
        item_id: str,
        role: str,
        text: str,
        created_at: float,
        metrics: dict | None = None,
    ):
        self.id = item_id
        self.role = role
        self.text_content = text
        self.created_at = created_at
        self.metrics = metrics or {}


class WorkerHelperTests(unittest.TestCase):
    def test_provider_error_remains_failed_after_visitor_disconnects(self):
        outcome = SessionOutcome()
        outcome.mark_active()
        outcome.mark_error()
        outcome.mark_visitor_disconnected()

        self.assertEqual(outcome.final_state, "FAILED")

    def test_pipeline_error_payload_contains_only_safe_stage_and_code(self):
        payload = pipeline_error_payload("TTS")

        self.assertEqual(payload, {
            "version": 1,
            "type": "PIPELINE_ERROR",
            "stage": "TTS",
            "code": "TTS_FAILED",
        })

        self.assertEqual(pipeline_status_payload("TTS", "success"), {
            "version": 1,
            "type": "PIPELINE_STATUS",
            "stage": "TTS",
            "status": "success",
        })

    def test_only_the_verified_browser_participant_can_close_the_session(self):
        expected = "visitor-user-1-unique"

        self.assertTrue(is_session_participant(
            expected,
            SimpleNamespace(identity=expected),
        ))
        self.assertFalse(is_session_participant(
            expected,
            SimpleNamespace(identity="another-participant"),
        ))
        self.assertFalse(is_session_participant(expected, object()))

    def test_persisted_transcript_keeps_traditional_text_not_tts_pronunciation_script(self):
        event = build_message_event(
            "eagle-room",
            FakeChatMessage(
                item_id="item-1",
                role="user",
                text="这个软件可以连上网络。",
                created_at=1_786_591_260.0,
            ),
        )

        self.assertEqual(event["role"], "USER")
        self.assertEqual(event["text"], "這個軟體可以連上網路。")
        self.assertNotIn("软体", event["text"])
        self.assertLessEqual(len(event["eventId"]), 128)

    def test_ignores_non_message_roles_and_empty_content(self):
        self.assertIsNone(build_message_event(
            "eagle-room",
            FakeChatMessage(item_id="item-1", role="system", text="hidden", created_at=0),
        ))
        self.assertIsNone(build_message_event(
            "eagle-room",
            FakeChatMessage(item_id="item-2", role="assistant", text="  ", created_at=0),
        ))

    def test_turn_metrics_log_only_latency_numbers(self):
        item = FakeChatMessage(
            item_id="item-3",
            role="assistant",
            text="完成",
            created_at=1,
            metrics={
                "llm_node_ttft": 0.42,
                "tts_node_ttfb": 0.63,
                "provider_request_ids": ["provider-secret-id"],
                "llm_metadata": {"model_name": "private-model"},
            },
        )

        self.assertEqual(safe_turn_metrics(item), {
            "llm_ttft": 0.42,
            "tts_ttfb": 0.63,
        })


if __name__ == "__main__":
    unittest.main()
