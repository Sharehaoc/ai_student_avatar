import unittest

from voice_agent.orchestrator import VoiceSessionOrchestrator
from voice_agent.providers.base import VoiceSessionContext
from voice_agent.providers.minimax_provider import MiniMaxProvider, MiniMaxTTS
from voice_agent.providers.openai_provider import OpenAIProvider
from voice_agent.providers.soniox_provider import SonioxProvider


class ProviderAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_rejects_course_placeholder_voice_id(self):
        with self.assertRaisesRegex(ValueError, "voice_id"):
            VoiceSessionContext(
                tenant_id="tenant-1",
                conversation_id="conversation-1",
                visitor_user_id="visitor-1",
                persona_version_id="persona-version-1",
                system_prompt="請使用繁體中文回答。",
                opening_message="你好，我們開始吧。",
                voice_id="student-voice-clone",
                voice_model="speech-2.6-hd",
                max_duration_seconds=600,
            )

    async def test_installed_livekit_adapters_build_without_network_calls(self):
        context = VoiceSessionContext(
            tenant_id="tenant-1",
            conversation_id="conversation-1",
            visitor_user_id="visitor-1",
            persona_version_id="persona-version-1",
            system_prompt="請使用繁體中文回答。",
            opening_message="你好，我們開始吧。",
            voice_id="voice-clone-1",
            voice_model="speech-2.6-hd",
            pronunciation_fixes={"專案": "專案"},
            max_duration_seconds=600,
        )
        runtime = VoiceSessionOrchestrator(
            stt=SonioxProvider(api_key="test-soniox"),
            llm=OpenAIProvider(api_key="test-openai", model="gpt-4.1-mini"),
            tts=MiniMaxProvider(
                api_key="test-minimax",
                group_id="test-group",
                api_host="https://api.minimax.io",
                ws_url="wss://api.minimax.io/ws/v1/t2a_v2",
                runtime="auto",
                volume=5.0,
                use_simplified_glyphs=True,
            ),
        ).build_runtime(context)

        self.assertEqual(type(runtime.stt).__module__, "livekit.plugins.soniox.stt")
        self.assertEqual(type(runtime.llm).__module__, "livekit.plugins.openai.llm")
        self.assertIsInstance(runtime.tts, MiniMaxTTS)
        self.assertEqual(runtime.tts.model, "speech-2.6-hd")
        self.assertEqual(runtime.tts.runtime, "ws")
        self.assertEqual(runtime.tts._options.volume, 5.0)

        for component in (runtime.tts, runtime.llm, runtime.stt):
            close = getattr(component, "aclose", None)
            if close is not None:
                await close()


if __name__ == "__main__":
    unittest.main()
