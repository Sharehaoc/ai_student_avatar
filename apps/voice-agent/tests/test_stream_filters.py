import asyncio
import unittest

from voice_agent.tts.stream_filters import safety_filter


async def collect_filtered(text: str, chunk_size: int) -> str:
    async def source():
        for start in range(0, len(text), chunk_size):
            yield text[start:start + chunk_size]

    return "".join([chunk async for chunk in safety_filter(source())])


class StreamSafetyFilterTests(unittest.IsolatedAsyncioTestCase):
    async def test_thinking_and_dialogue_script_filters_are_chunk_independent(self):
        text = "先聽你說。（思考：這段絕對不能念出來）我們再處理。使用者: 接著幫你自問自答。"
        expected = "先聽你說。我們再處理。"

        for chunk_size in (1, 2, 5, 11, len(text)):
            with self.subTest(chunk_size=chunk_size):
                self.assertEqual(await collect_filtered(text, chunk_size), expected)

    async def test_normal_parentheses_and_partial_markers_are_preserved(self):
        self.assertEqual(
            await collect_filtered("這是（正常補充），不是思考標籤。", 1),
            "這是（正常補充），不是思考標籤。",
        )


if __name__ == "__main__":
    unittest.main()
