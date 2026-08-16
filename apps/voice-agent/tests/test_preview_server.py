import unittest

from voice_agent.preview_server import parse_preview_payload


class PreviewServerTests(unittest.TestCase):
    def test_preview_payload_is_strict_and_uses_server_forwarded_voice_context(self):
        parsed = parse_preview_payload({
            "text": "你好，這是聲音試聽。",
            "voice": {
                "provider": "minimax",
                "voiceId": "voice-clone-1",
                "model": "speech-2.6-hd",
            },
            "pronunciationFixes": {"飛鷹": "飛英"},
        })

        self.assertEqual(parsed.voice_id, "voice-clone-1")
        self.assertEqual(parsed.pronunciation_fixes, {"飛鷹": "飛英"})
        with self.assertRaises(ValueError):
            parse_preview_payload({
                "text": "你好",
                "voice": {
                    "provider": "minimax",
                    "voiceId": "student-voice-clone",
                    "model": "speech-2.6-hd",
                },
                "pronunciationFixes": {},
            })
        with self.assertRaises(ValueError):
            parse_preview_payload({
                "text": "你好",
                "voice": {
                    "provider": "minimax",
                    "voiceId": "voice-clone-1",
                    "model": "speech-2.6-hd",
                },
                "pronunciationFixes": {},
                "apiKey": "attacker-value",
            })


if __name__ == "__main__":
    unittest.main()
