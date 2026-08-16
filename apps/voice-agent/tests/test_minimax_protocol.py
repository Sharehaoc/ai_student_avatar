import json
import unittest

from voice_agent.providers.minimax_protocol import (
    MiniMaxSseDecoder,
    build_t2a_payload,
    select_minimax_runtime,
)


class MiniMaxProtocolTests(unittest.TestCase):
    def test_http_payload_uses_pcm_streaming_without_aggregated_duplicate_audio(self):
        payload = build_t2a_payload(
            text="我們開始。",
            voice_id="voice-clone-1",
            model="speech-02-turbo",
            sample_rate=24_000,
        )

        self.assertTrue(payload["stream"])
        self.assertEqual(payload["stream_options"], {"exclude_aggregated_audio": True})
        self.assertEqual(payload["audio_setting"], {
            "sample_rate": 24_000,
            "format": "pcm",
            "channel": 1,
        })

    def test_sse_decoder_handles_arbitrary_network_chunk_boundaries(self):
        events = [
            {"data": {"status": 1, "audio": "00010203"}, "base_resp": {"status_code": 0}},
            {"data": {"status": 2, "audio": ""}, "base_resp": {"status_code": 0}},
        ]
        raw = "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()

        for chunk_size in (1, 3, 17, len(raw)):
            decoder = MiniMaxSseDecoder()
            audio = []
            for start in range(0, len(raw), chunk_size):
                audio.extend(decoder.feed(raw[start:start + chunk_size]))
            audio.extend(decoder.finish())
            self.assertEqual(audio, [b"\x00\x01\x02\x03"])

    def test_sse_decoder_accepts_crlf_events_split_between_chunks(self):
        event = {
            "data": {"status": 1, "audio": "0a0b"},
            "base_resp": {"status_code": 0},
        }
        raw = f"data: {json.dumps(event)}\r\n\r\n".encode()
        split_at = raw.index(b"\r\n") + 1
        decoder = MiniMaxSseDecoder()

        audio = decoder.feed(raw[:split_at])
        audio.extend(decoder.feed(raw[split_at:]))
        audio.extend(decoder.finish())

        self.assertEqual(audio, [b"\x0a\x0b"])

    def test_runtime_auto_matches_coach_model_strategy(self):
        self.assertEqual(select_minimax_runtime("speech-2.6-hd", "auto"), "ws")
        self.assertEqual(select_minimax_runtime("speech-02-turbo", "auto"), "http")
        self.assertEqual(select_minimax_runtime("speech-2.6-hd", "http"), "http")


if __name__ == "__main__":
    unittest.main()
