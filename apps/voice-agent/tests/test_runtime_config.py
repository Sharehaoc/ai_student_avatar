import unittest

from voice_agent.runtime_config import VoiceAgentEnvironment


BASE_ENV = {
    "CORE_API_URL": "https://api.student.example",
    "VOICE_INTERNAL_TOKEN": "internal-token-that-is-long-enough",
    "SONIOX_API_KEY": "soniox-secret",
    "OPENAI_API_KEY": "openai-secret",
    "OPENAI_MODEL": "gpt-4.1-mini",
    "MINIMAX_API_KEY": "minimax-secret",
    "LIVEKIT_AGENT_NAME": "flying-eagle-voice-agent",
}


class VoiceAgentEnvironmentTests(unittest.TestCase):
    def test_worker_defaults_to_loopback_and_allows_explicit_deployment_host(self):
        local = VoiceAgentEnvironment.from_mapping(BASE_ENV)
        deployed = VoiceAgentEnvironment.from_mapping(
            dict(BASE_ENV, LIVEKIT_WORKER_HOST="0.0.0.0")
        )

        self.assertEqual(local.livekit_worker_host, "127.0.0.1")
        self.assertEqual(deployed.livekit_worker_host, "0.0.0.0")
        self.assertEqual(local.openai_model, "gpt-4.1-mini")
        self.assertEqual(local.minimax_api_host, "https://api.minimax.io")

    def test_requires_every_server_secret_and_a_long_internal_token(self):
        for name in (
            "CORE_API_URL",
            "VOICE_INTERNAL_TOKEN",
            "SONIOX_API_KEY",
            "OPENAI_API_KEY",
            "OPENAI_MODEL",
            "MINIMAX_API_KEY",
            "LIVEKIT_AGENT_NAME",
        ):
            with self.subTest(name=name):
                broken = dict(BASE_ENV)
                broken.pop(name)
                with self.assertRaises(ValueError):
                    VoiceAgentEnvironment.from_mapping(broken)

        broken = dict(BASE_ENV, VOICE_INTERNAL_TOKEN="short")
        with self.assertRaisesRegex(ValueError, "VOICE_INTERNAL_TOKEN"):
            VoiceAgentEnvironment.from_mapping(broken)

    def test_rejects_plain_http_outside_local_development(self):
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            VoiceAgentEnvironment.from_mapping(
                dict(BASE_ENV, CORE_API_URL="http://api.student.example")
            )

        local = VoiceAgentEnvironment.from_mapping(
            dict(BASE_ENV, CORE_API_URL="http://localhost:8080")
        )
        self.assertEqual(local.core_api_url, "http://localhost:8080")

    def test_minimax_runtime_and_boolean_flags_are_strict(self):
        parsed = VoiceAgentEnvironment.from_mapping(
            dict(
                BASE_ENV,
                MINIMAX_TTS_RUNTIME="ws",
                MINIMAX_TTS_SIMPLIFIED_GLYPH="false",
                SONIOX_ENABLE_SPEAKER_DIARIZATION="false",
            )
        )
        self.assertEqual(parsed.minimax_runtime, "ws")
        self.assertFalse(parsed.minimax_simplified_glyphs)
        self.assertFalse(parsed.soniox_speaker_diarization)

        with self.assertRaisesRegex(ValueError, "MINIMAX_TTS_RUNTIME"):
            VoiceAgentEnvironment.from_mapping(
                dict(BASE_ENV, MINIMAX_TTS_RUNTIME="unknown")
            )


if __name__ == "__main__":
    unittest.main()
