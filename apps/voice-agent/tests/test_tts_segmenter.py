import unittest

from voice_agent.tts.segmenter import SafeTTSStreamSegmenter


def segment_text(text: str, chunk_size: int) -> list[str]:
    segmenter = SafeTTSStreamSegmenter()
    segments = []
    for start in range(0, len(text), chunk_size):
        segments.extend(
            decision.text
            for decision in segmenter.feed(text[start:start + chunk_size])
        )
    segments.extend(decision.text for decision in segmenter.finish())
    return segments


class SafeTTSStreamSegmenterTests(unittest.TestCase):
    def test_segmentation_is_independent_of_llm_chunk_size(self):
        text = "我們今天先把真正重要的問題說清楚，接著再決定下一步怎麼做。"
        expected = ["我們今天先把真正重要的問題說清楚，", "接著再決定下一步怎麼做。"]

        for chunk_size in (1, 4, 11, 23):
            with self.subTest(chunk_size=chunk_size):
                self.assertEqual(segment_text(text, chunk_size), expected)

    def test_numbers_and_closing_marks_are_not_split(self):
        self.assertEqual(
            segment_text("她說：「預算是 NT$1,500。」然後繼續。", 1),
            ["她說：「預算是 NT$1,500。」", "然後繼續。"],
        )

    def test_phone_price_and_time_separators_are_not_boundaries(self):
        self.assertEqual(
            segment_text("做法是打 2230-5858，費用 NT$1,500，時間 12:30。", 1),
            ["做法是打 2230-5858，", "費用 NT$1,500，時間 12:30。"],
        )

    def test_whitespace_is_folded_without_becoming_a_boundary(self):
        self.assertEqual(
            segment_text("這是一段足夠長的內容\n\n還沒有說完。", 4),
            ["這是一段足夠長的內容 還沒有說完。"],
        )

    def test_first_and_later_soft_boundaries_use_different_thresholds(self):
        segmenter = SafeTTSStreamSegmenter()
        decisions = segmenter.feed("先把這件重要的事情說清楚，後段很短，繼續。")
        decisions.extend(segmenter.finish())

        self.assertEqual(
            [(decision.text, decision.reason) for decision in decisions],
            [
                ("先把這件重要的事情說清楚，", "first_soft"),
                ("後段很短，繼續。", "hard_end"),
            ],
        )

    def test_unpunctuated_text_waits_for_turn_end(self):
        text = "這是一段沒有任何標點的長文" * 12
        segmenter = SafeTTSStreamSegmenter()

        self.assertEqual(segmenter.feed(text), [])
        self.assertEqual(
            [(decision.text, decision.reason) for decision in segmenter.finish()],
            [(text, "turn_end")],
        )


if __name__ == "__main__":
    unittest.main()
