import unittest

from voice_agent.tts.text_pipeline import prepare_tts_segment, prepare_tts_segments


class TTSBoundaryTextPipelineTests(unittest.TestCase):
    def test_mainland_erhua_is_rewritten_as_taiwan_spoken_text(self):
        self.assertEqual(
            prepare_tts_segment(
                "你們各有各的事兒，我等一會兒再回來。",
                use_simplified_glyphs=False,
            ),
            "你們各有各的事情，我等一下再回來。",
        )

    def test_common_mainland_technical_terms_use_taiwan_wording(self):
        self.assertEqual(
            prepare_tts_segment(
                "登录账号，打开文件夹看视频，再提交反馈和手机充值。",
                use_simplified_glyphs=False,
            ),
            "登入帳號，打開資料夾看影片，再提交回饋和手機儲值。",
        )

    def test_internal_thinking_annotations_are_not_spoken(self):
        self.assertEqual(
            prepare_tts_segment(
                "（思考：先不要讓對方知道）我們先處理最重要的事。",
                use_simplified_glyphs=False,
            ),
            "我們先處理最重要的事。",
        )

    def test_model_generated_user_script_is_truncated(self):
        self.assertEqual(
            prepare_tts_segment(
                "我懂你的意思。使用者: 那我接著自己回答。",
                use_simplified_glyphs=False,
            ),
            "我懂你的意思。",
        )

    def test_simplified_llm_output_becomes_taiwan_traditional_before_speech(self):
        self.assertEqual(
            prepare_tts_segment(
                "这个软件可以连上网络。",
                use_simplified_glyphs=False,
            ),
            "這個軟體可以連上網路。",
        )

    def test_taiwan_technology_terms_keep_existing_wording(self):
        self.assertEqual(
            prepare_tts_segment(
                "出租车、软件、硬件、鼠标、打印机、账号",
                use_simplified_glyphs=False,
            ),
            "計程車、軟體、硬體、滑鼠、印表機、帳號",
        )

    def test_phone_numbers_are_spoken_digit_by_digit(self):
        self.assertEqual(
            prepare_tts_segment(
                "手機 0927-665-551",
                use_simplified_glyphs=False,
            ),
            "手機 零九二七，六六五，五五一",
        )

    def test_new_taiwan_dollar_prices_are_spoken_naturally(self):
        self.assertEqual(
            prepare_tts_segment(
                "價格 NT$1,500",
                use_simplified_glyphs=False,
            ),
            "價格 新台幣一千五百元",
        )

    def test_decimal_percentages_are_spoken_naturally(self):
        self.assertEqual(
            prepare_tts_segment(
                "成功率 12.5%",
                use_simplified_glyphs=False,
            ),
            "成功率 百分之十二點五",
        )

    def test_years_are_spoken_digit_by_digit(self):
        self.assertEqual(
            prepare_tts_segment("2026年", use_simplified_glyphs=False),
            "二零二六年",
        )

    def test_polyphonic_chang_is_rewritten_by_meaning(self):
        self.assertEqual(
            prepare_tts_segment(
                "成長、長大、長期、很長、部長",
                use_simplified_glyphs=False,
            ),
            "成掌、掌大、常期、很常、部長",
        )

    def test_common_polyphonic_words_keep_their_intended_meaning(self):
        self.assertEqual(
            prepare_tts_segment(
                "調整、調薪、音調；還錢、還是；沒有誰、誰會；店鋪、鋪路",
                use_simplified_glyphs=False,
            ),
            "條整、條薪、音調；環錢、還是；沒有人、哪位會；店鋪、撲路",
        )

    def test_pronunciation_hints_do_not_change_unrelated_contexts(self):
        self.assertEqual(
            prepare_tts_segment(
                "知識、常識、還是、還有、便宜、音調、調查、調味、店鋪、部長",
                use_simplified_glyphs=False,
            ),
            "知識、常識、還是、還有、便宜、音調、調查、調味、店鋪、部長",
        )

    def test_taipei_101_is_spoken_as_a_name_not_a_number(self):
        self.assertEqual(
            prepare_tts_segment("台北101", use_simplified_glyphs=False),
            "台北一零一",
        )

    def test_seven_eleven_brand_is_not_read_as_a_numeric_range(self):
        self.assertEqual(
            prepare_tts_segment("去7-11買東西", use_simplified_glyphs=False),
            "去Seven Eleven買東西",
        )

    def test_pill_count_ranges_are_spoken_without_a_dash(self):
        self.assertEqual(
            prepare_tts_segment("一天吃 5 到 6 顆", use_simplified_glyphs=False),
            "一天吃 五六顆",
        )

    def test_hotline_numbers_are_spoken_digit_by_digit_but_prices_are_not(self):
        self.assertEqual(
            prepare_tts_segment("請撥 1995 生命線", use_simplified_glyphs=False),
            "請撥 一九九五 生命線",
        )
        self.assertEqual(
            prepare_tts_segment("費用 1995 元", use_simplified_glyphs=False),
            "費用 一千九百九十五元",
        )

    def test_each_persona_can_supply_voice_specific_pronunciation_fixes(self):
        self.assertEqual(
            prepare_tts_segment(
                "這個分身叫飛鷹",
                pronunciation_fixes={"飛鷹": "飛英"},
                use_simplified_glyphs=False,
            ),
            "這個分身叫飛英",
        )

    def test_minimax_can_receive_simplified_glyphs_without_mainland_wording(self):
        self.assertEqual(
            prepare_tts_segment("軟體 硬體 網路 計程車 隨身碟 瞭解"),
            "软体 硬体 网路 计程车 随身碟 了解",
        )

    def test_safe_segmentation_runs_before_pronunciation_normalization(self):
        self.assertEqual(
            prepare_tts_segments(
                "電話是 02-2230-5858，價格 NT$1,500。",
                use_simplified_glyphs=False,
            ),
            ["電話是 零二，二二三零，五八五八，", "價格 新台幣一千五百元。"],
        )

    def test_dash_and_ellipsis_artifacts_become_natural_pauses(self):
        self.assertEqual(
            prepare_tts_segment(
                "先確認—再決定……",
                use_simplified_glyphs=False,
            ),
            "先確認，再決定，",
        )


if __name__ == "__main__":
    unittest.main()
