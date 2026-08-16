import unittest

from voice_agent.orchestrator import VoiceSessionOrchestrator
from voice_agent.providers.base import VoiceSessionContext


class FakeProvider:
    def __init__(self, name):
        self.name = name
        self.contexts = []

    def create(self, context):
        self.contexts.append(context)
        return f"{self.name}-runtime"

    async def health(self):
        raise NotImplementedError


class VoiceSessionOrchestratorTests(unittest.TestCase):
    def test_orchestrator_builds_runtime_only_through_provider_interfaces(self):
        stt = FakeProvider("soniox")
        llm = FakeProvider("openai")
        tts = FakeProvider("minimax")
        orchestrator = VoiceSessionOrchestrator(stt=stt, llm=llm, tts=tts)
        context = VoiceSessionContext(
            tenant_id="student-1",
            conversation_id="conversation-1",
            visitor_user_id="visitor-1",
            persona_version_id="persona-version-2",
            system_prompt="你是學生定義的 AI 分身。",
            opening_message="嗨，今天想聊什麼？",
            voice_id="voice-clone-1",
            voice_model="speech-2.6-hd",
            max_duration_seconds=1800,
            pronunciation_fixes={"飛鷹": "飛英"},
        )

        runtime = orchestrator.build_runtime(context)

        self.assertEqual(runtime.stt, "soniox-runtime")
        self.assertEqual(runtime.llm, "openai-runtime")
        self.assertEqual(runtime.tts, "minimax-runtime")
        self.assertEqual(stt.contexts, [context])
        self.assertEqual(llm.contexts, [context])
        self.assertEqual(tts.contexts, [context])
        self.assertEqual(context.pronunciation_fixes, {"飛鷹": "飛英"})


if __name__ == "__main__":
    unittest.main()
