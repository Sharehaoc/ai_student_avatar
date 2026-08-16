import unittest

from voice_agent.core_client import parse_voice_runtime_context
from voice_agent.runtime_metadata import DispatchMetadata


METADATA = DispatchMetadata(
    tenant_id="11111111-1111-4111-8111-111111111111",
    conversation_id="22222222-2222-4222-8222-222222222222",
    visitor_user_id="33333333-3333-4333-8333-333333333333",
    persona_version_id="44444444-4444-4444-8444-444444444444",
)

PAYLOAD = {
    "conversationId": METADATA.conversation_id,
    "tenantId": METADATA.tenant_id,
    "visitorUserId": METADATA.visitor_user_id,
    "personaVersionId": METADATA.persona_version_id,
    "systemPrompt": "你是學生定義的 AI 分身。",
    "openingMessage": "嗨，今天想聊什麼？",
    "voice": {
        "provider": "minimax",
        "voiceId": "voice-clone-1",
        "model": "speech-2.6-hd",
    },
    "pronunciationFixes": {"飛鷹": "飛英"},
    "maxDurationSeconds": 1_800,
}


class CoreRuntimeContextTests(unittest.TestCase):
    def test_parses_strict_server_snapshot_into_immutable_session_context(self):
        context = parse_voice_runtime_context(PAYLOAD, expected=METADATA)

        self.assertEqual(context.voice_id, "voice-clone-1")
        self.assertEqual(context.voice_model, "speech-2.6-hd")
        self.assertEqual(context.opening_message, "嗨，今天想聊什麼？")
        self.assertEqual(context.max_duration_seconds, 1_800)

    def test_rejects_unknown_fields_wrong_provider_and_metadata_mismatch(self):
        with self.assertRaisesRegex(ValueError, "fields"):
            parse_voice_runtime_context({**PAYLOAD, "apiKey": "leak"}, expected=METADATA)

        with self.assertRaisesRegex(ValueError, "provider"):
            parse_voice_runtime_context(
                {**PAYLOAD, "voice": {**PAYLOAD["voice"], "provider": "other"}},
                expected=METADATA,
            )

        with self.assertRaisesRegex(ValueError, "metadata mismatch"):
            parse_voice_runtime_context(
                {**PAYLOAD, "tenantId": "55555555-5555-4555-8555-555555555555"},
                expected=METADATA,
            )


if __name__ == "__main__":
    unittest.main()
