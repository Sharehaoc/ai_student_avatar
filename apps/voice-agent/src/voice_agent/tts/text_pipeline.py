"""TTS-only text preparation shared by voice provider adapters.

Source concepts:
- COACH_Tracy(David版)/tracy-voice-engine/agent/voice_text_filters.py
- COACH_Tracy(David版)/tracy-voice-engine/agent/tts_text_normalizer.py

The returned text is a pronunciation script. It must never replace the
Traditional Chinese transcript stored in the database or shown in the UI.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from functools import lru_cache

from opencc import OpenCC

from voice_agent.tts.segmenter import SafeTTSStreamSegmenter


_SIMPLIFIED_TO_TAIWAN = OpenCC("s2twp")
_TAIWAN_TO_SIMPLIFIED = OpenCC("tw2s")
_TAIWAN_SPOKEN_REPLACEMENTS = {
    "賬號": "帳號",
    "開啟": "打開",
    "登錄帳號": "登入帳號",
    "登錄頁面": "登入頁面",
    "登錄系統": "登入系統",
    "視頻通話": "視訊通話",
    "視頻會議": "視訊會議",
    "手機充值": "手機儲值",
    "文件夾": "資料夾",
    "視頻": "影片",
    "反饋": "回饋",
    "這事兒": "這件事",
    "這事儿": "這件事",
    "这事儿": "這件事",
    "那事兒": "那件事",
    "那事儿": "那件事",
    "沒事兒": "沒事",
    "沒事儿": "沒事",
    "没事儿": "沒事",
    "有事兒": "有事情",
    "有事儿": "有事情",
    "事兒": "事情",
    "事儿": "事情",
    "哪兒": "哪裡",
    "哪儿": "哪裡",
    "這兒": "這裡",
    "这儿": "這裡",
    "那兒": "那裡",
    "那儿": "那裡",
    "等一會兒": "等一下",
    "等一会儿": "等一下",
    "一會兒": "等一下",
    "一会儿": "等一下",
    "會兒": "一下",
    "会儿": "一下",
    "點兒": "一點",
    "点儿": "一點",
    "玩兒": "玩",
    "玩儿": "玩",
    "網絡": "網路",
}

_TTS_BOUNDARY_CHARS = r"\s\u3000，。！？、：；,.!?;:()\[\]{}\"'「」『』《》〈〉【】"
_DASH_SEPARATOR_RE = re.compile(r"(?:-{2,}|[\u2014\u2013\u2500\u2501\uff0d]+)")
_STANDALONE_ONE_ONE_RE = re.compile(
    rf"(^|[{_TTS_BOUNDARY_CHARS}])\u4e00{{2,}}(?=$|[{_TTS_BOUNDARY_CHARS}])"
)
_REPEATED_PAUSE_RE = re.compile(r"[，,]\s*[，,]+")
_ELLIPSIS_RE = re.compile(r"(?:…{2,}|⋯{2,})")
_THINKING_TAG_RE = re.compile(
    r"(?:（|\()\s*思考\s*[：:]\s*.*?(?:）|\))",
    flags=re.DOTALL,
)
_DIALOGUE_SCRIPT_MARKERS = ("用戶:", "用户:", "User:", "使用者:", "USER:")
_DIGITS = dict(zip("0123456789", "零一二三四五六七八九", strict=True))
_UNITS = ("", "十", "百", "千")
_WHO_SEMANTIC_REPLACEMENTS = (
    ("沒有誰", "沒有人"),
    ("誰都", "每個人都"),
    ("誰也", "任何人都"),
    ("任誰", "任何人"),
    ("誰家", "哪一家"),
    ("誰人", "哪一個人"),
    ("騙誰", "騙哪個人"),
)
_MINIMAX_PRONUNCIATION_HINTS = (
    ("跌過", "疊過"),
    ("攻擊", "攻及"),
    ("哈囉", "Hello"),
    ("哈嘍", "Hello"),
    ("準備得", "準備德"),
    ("糾結", "鳩節"),
    ("反彈", "反談"),
    ("模糊", "模胡"),
    ("我以為", "我以維"),
    ("系統要調", "系統要條"),
    ("調整", "條整"),
    ("調薪", "條薪"),
    ("認識", "刃事"),
    ("意識", "意事"),
    ("乾淨", "甘淨"),
    ("待會兒", "等一下"),
    ("待會", "等一下"),
    ("嘔吐", "偶兔"),
    ("拚", "拼"),
    ("關係", "關西"),
    ("便宜還", "便宜環"),
    ("還給我", "環給我"),
    ("還不出來", "環不出來"),
    ("還錢", "環錢"),
    ("還債", "環債"),
    ("要還", "要環"),
    ("反應", "反硬"),
    ("彈性", "談性"),
    ("測量", "測粱"),
    ("數量", "數亮"),
    ("答應", "搭硬"),
    ("累積", "壘積"),
    ("教練", "叫練"),
    ("給不了我", "給不療我"),
    ("變", "辯"),
)
_SMALL_TTS_NUMBERS = {
    **{str(index): spoken for index, spoken in enumerate("零一二三四五六七八九") if index},
    **{character: character for character in "一二兩三四五六七八九"},
}
_SIMPLIFIED_GLYPH_WHITELIST = frozenset(
    "萬與專業東絲兩嚴喪個中豐臨為麗舉麼義烏樂喬習鄉書買亂乾瞭爭事於亞產親億僅價儀"
    "們優會傳傷傾像兒內關興其養冊寫決況凍準凱別劃劇劑動務勝勞勢區醫華協單賣衛卻廠"
    "廳歷壓參雙發變臺號後嚇聽啟吳員問啞喚團園圓圖國場塊堅報壞壽夢夠奮婦媽學寧寶實"
    "審將對導層歲島嶼師帳帶幣幫幹幾庫廢廣彈強錄從復徵德應態慣慮慶憶懷懶戰戲戶拋換"
    "據擇擔擾攔數斷時晉暫條標樣機權歸殘氣沒淨淚測溝灣無煩爾狀獨現環瑣當疊盡監盤眾"
    "著確碼礙禮種穩窮筆節簡簽類糾紀級組結絕經緒續線練縣總繼纏罵聖聞聯聰聲職肅腦舊"
    "艱處術複視覺觀觸訂計訊記許話該詳認語誤說請諾讀讓貝負財責質賴資賽贏趕趨跡踐轉"
    "輕軟輸邊這連過還選遞遠適遷郵鄭醜釐釋重量錢錯鍵長車門開間隊階際雜難電隨靈響頁"
    "項順領題顧願風飛飯館馬體網鬆鬥鬱魚鳩鳴齊"
)
_SIMPLIFIED_GLYPH_EXCEPTIONS = {"乾": "乾", "著": "着", "瞭": "了"}


def normalize_taiwan_spoken_text(text: str) -> str:
    """Rewrite common mainland spoken forms and TTS separator artifacts."""
    result = str(text or "")
    for old, new in _TAIWAN_SPOKEN_REPLACEMENTS.items():
        result = result.replace(old, new)
    result = _DASH_SEPARATOR_RE.sub("，", result)
    result = _ELLIPSIS_RE.sub("，", result)
    result = _STANDALONE_ONE_ONE_RE.sub(r"\1", result)
    result = _REPEATED_PAUSE_RE.sub("，", result)
    return re.sub(r"\s{2,}", " ", result)


def apply_pronunciation_fixes(
    text: str,
    pronunciation_fixes: Mapping[str, str] | None,
) -> str:
    """Apply one PersonaVersion's voice-specific homophonic reading hints."""
    result = text
    fixes = pronunciation_fixes or {}
    for old in sorted(fixes, key=len, reverse=True):
        if not str(old).strip():
            continue
        result = result.replace(old, str(fixes[old]))
    return result


def strip_thinking_annotations(text: str) -> str:
    """Remove model-internal thinking annotations from spoken output."""
    return _THINKING_TAG_RE.sub("", str(text or ""))


def truncate_dialogue_script(text: str) -> str:
    """Stop before a model starts inventing the user's side of a dialogue."""
    result = str(text or "")
    positions = [result.find(marker) for marker in _DIALOGUE_SCRIPT_MARKERS]
    matches = [position for position in positions if position >= 0]
    return result[: min(matches)] if matches else result


def to_taiwan_traditional(text: str) -> str:
    """Convert Simplified Chinese and regional terms to Taiwan Traditional."""
    return _SIMPLIFIED_TO_TAIWAN.convert(str(text or ""))


@lru_cache(maxsize=4_096)
def _to_simplified_glyph(character: str) -> str:
    if character in _SIMPLIFIED_GLYPH_EXCEPTIONS:
        return _SIMPLIFIED_GLYPH_EXCEPTIONS[character]
    if character not in _SIMPLIFIED_GLYPH_WHITELIST:
        return character
    return _TAIWAN_TO_SIMPLIFIED.convert(character)


def to_simplified_glyphs(text: str) -> str:
    """Convert glyphs one character at a time without changing Taiwan words."""
    return "".join(_to_simplified_glyph(character) for character in text)


def _digits_to_spoken(value: str) -> str:
    return "".join(_DIGITS.get(character, character) for character in value)


def _int_to_zh(value: int) -> str:
    if value == 0:
        return "零"
    if value < 0:
        return "負" + _int_to_zh(abs(value))
    if value >= 10_000:
        high, low = divmod(value, 10_000)
        result = _int_to_zh(high) + "萬"
        if low:
            result += ("零" if low < 1_000 else "") + _int_to_zh(low)
        return result

    digits = [int(character) for character in str(value)]
    parts: list[str] = []
    zero_pending = False
    for index, digit in enumerate(digits):
        position = len(digits) - index - 1
        if digit == 0:
            if parts:
                zero_pending = True
            continue
        if zero_pending:
            parts.append("零")
            zero_pending = False
        if not (digit == 1 and position == 1 and not parts):
            parts.append(_DIGITS[str(digit)])
        parts.append(_UNITS[position])
    return "".join(parts)


def _number_text(value: str) -> str:
    cleaned = value.replace(",", "").strip()
    return _int_to_zh(int(cleaned)) if cleaned else value


def _decimal_number_text(value: str) -> str:
    if "." not in value:
        return _number_text(value)
    integer, decimal = value.split(".", 1)
    return f"{_number_text(integer)}點{_digits_to_spoken(decimal)}"


def _phone_replacement(match: re.Match[str]) -> str:
    value = match.group(0).replace("+", "加")
    groups = re.split(r"[-\s]+", value)
    spoken_groups: list[str] = []
    for group in groups:
        if not group:
            continue
        if group.startswith("加"):
            spoken_groups.append("加" + _digits_to_spoken(group[1:]))
        else:
            spoken_groups.append(_digits_to_spoken(group))
    return "，".join(spoken_groups)


def normalize_phone_numbers(text: str) -> str:
    result = text
    patterns = (
        r"\+886[-\s]?\d{2,3}[-\s]?\d{3}[-\s]?\d{3}",
        r"09\d{2}[-\s]?\d{3}[-\s]?\d{3}",
        r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{3,4}",
        r"(?<![\dA-Za-z])\d{4}[-\s]\d{4}(?![\dA-Za-z])",
    )
    for pattern in patterns:
        result = re.sub(pattern, _phone_replacement, result)
    return result


def normalize_hotline_numbers(text: str) -> str:
    def replacement(match: re.Match[str]) -> str:
        following = match.string[match.end() : match.end() + 4].lstrip()
        if following.startswith(("年", "年代", "元", "萬", "人", "件", "次", "%", "％")):
            return match.group(0)
        return _digits_to_spoken(match.group(0))

    return re.sub(
        r"(?<![\dA-Za-z])(?:1925|1995)(?![\dA-Za-z])",
        replacement,
        text,
    )


def normalize_prices(text: str) -> str:
    def new_taiwan_dollar(match: re.Match[str]) -> str:
        return "新台幣" + _number_text(match.group("amount")) + "元"

    def plain_dollar(match: re.Match[str]) -> str:
        return _number_text(match.group("amount")) + "元"

    result = re.sub(
        r"(?i)(?:NT\$|NTD)\s*(?P<amount>\d[\d,]*)\s*(?:元)?",
        new_taiwan_dollar,
        text,
    )
    result = re.sub(
        r"(?<![\w])\$\s*(?P<amount>\d[\d,]*)",
        new_taiwan_dollar,
        result,
    )
    return re.sub(
        r"(?<![\w-])(?P<amount>\d{1,3}(?:,\d{3})+|\d+)\s*元",
        plain_dollar,
        result,
    )


def normalize_percentages(text: str) -> str:
    return re.sub(
        r"(?<![\w.])(\d+(?:\.\d+)?)\s*[%％]",
        lambda match: "百分之" + _decimal_number_text(match.group(1)),
        text,
    )


def normalize_pill_count_ranges(text: str) -> str:
    def replacement(match: re.Match[str]) -> str:
        first = _SMALL_TTS_NUMBERS.get(match.group("first"), match.group("first"))
        second = _SMALL_TTS_NUMBERS.get(match.group("second"), match.group("second"))
        return f"{first}{second}顆"

    return re.sub(
        r"(?P<first>[1-9一二兩三四五六七八九])\s*(?:到|至|~|-)\s*"
        r"(?P<second>[1-9一二兩三四五六七八九])\s*顆",
        replacement,
        text,
    )


def normalize_years(text: str) -> str:
    return re.sub(
        r"(?<!\d)(?P<year>(?:19|20)\d{2})(?P<suffix>年(?:代|初|底|間|前|後)?)",
        lambda match: _digits_to_spoken(match.group("year")) + match.group("suffix"),
        text,
    )


def normalize_taipei_101(text: str) -> str:
    result = re.sub(r"[臺台]北\s*101", "台北一零一", text)
    return re.sub(r"(?<![A-Za-z0-9])101(?![A-Za-z0-9])", "一零一", result)


def normalize_brand_pronunciations(text: str) -> str:
    return re.sub(
        r"(?<!\d)7[-－–—](?:11|Eleven)(?!\d)",
        "Seven Eleven",
        text,
        flags=re.IGNORECASE,
    )


def normalize_polyphonic_contexts(text: str) -> str:
    """Use homophonic glyph hints where MiniMax misreads polyphonic words."""
    result = text.replace("成長", "成掌").replace("生長", "生掌")
    result = re.sub(r"長(?=大|成|高|出|得)", "掌", result)
    result = re.sub(r"長(?=短|度|期|時間|距離|方形)", "常", result)
    result = re.sub(r"(?<=[很太更最超較不延拉加])長", "常", result)
    for old, new in _WHO_SEMANTIC_REPLACEMENTS:
        result = result.replace(old, new)
    result = result.replace("誰", "哪位")
    for old, new in _MINIMAX_PRONUNCIATION_HINTS:
        result = result.replace(old, new)
    return re.sub(r"(?<![店商])鋪(?=鋪路|路|一步|步)", "撲", result)


def prepare_tts_input_text(
    text: str,
    *,
    pronunciation_fixes: Mapping[str, str] | None = None,
) -> str:
    """Apply LLM-output safety and Persona rules before safe segmentation."""
    result = strip_thinking_annotations(text)
    result = truncate_dialogue_script(result)
    result = to_taiwan_traditional(result)
    result = normalize_taiwan_spoken_text(result)
    return apply_pronunciation_fixes(result, pronunciation_fixes).strip()


def normalize_minimax_tts_segment(
    text: str,
    *,
    use_simplified_glyphs: bool = True,
) -> str:
    """Apply MiniMax-specific reading hints to one safely split segment."""
    result = text
    result = normalize_phone_numbers(result)
    result = normalize_hotline_numbers(result)
    result = normalize_pill_count_ranges(result)
    result = normalize_percentages(result)
    result = normalize_prices(result)
    result = normalize_taipei_101(result)
    result = normalize_years(result)
    result = normalize_brand_pronunciations(result)
    result = normalize_polyphonic_contexts(result)
    result = re.sub(r"\s{2,}", " ", result).strip()
    return to_simplified_glyphs(result) if use_simplified_glyphs else result


def prepare_tts_segment(
    text: str,
    *,
    pronunciation_fixes: Mapping[str, str] | None = None,
    use_simplified_glyphs: bool = True,
) -> str:
    """Return a provider-ready reading script for one complete TTS segment."""
    prepared = prepare_tts_input_text(
        text,
        pronunciation_fixes=pronunciation_fixes,
    )
    return normalize_minimax_tts_segment(
        prepared,
        use_simplified_glyphs=use_simplified_glyphs,
    )


def prepare_tts_segments(
    text: str,
    *,
    pronunciation_fixes: Mapping[str, str] | None = None,
    use_simplified_glyphs: bool = True,
) -> list[str]:
    """Clean raw LLM text, split it safely, then prepare it for MiniMax."""
    prepared_input = prepare_tts_input_text(
        text,
        pronunciation_fixes=pronunciation_fixes,
    )
    segmenter = SafeTTSStreamSegmenter()
    decisions = segmenter.feed(prepared_input)
    decisions.extend(segmenter.finish())
    return [
        prepared
        for decision in decisions
        if (
            prepared := normalize_minimax_tts_segment(
                decision.text,
                use_simplified_glyphs=use_simplified_glyphs,
            )
        )
    ]
