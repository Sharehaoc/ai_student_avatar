"""Pure, stateful text segmentation for streaming TTS.

Source: COACH_Tracy(David版)/tracy-voice-engine/agent/tts_segmenter.py
Method: direct extraction with package-path and documentation changes only.
"""

from dataclasses import dataclass


_HARD_ENDINGS = frozenset("。！？!?\u2026")
_SOFT_ENDINGS = frozenset("，,、；;：:")
_CLOSING_MARKS = frozenset("」』》〉】”’\"'")
_NUMERIC_SEPARATORS = frozenset(",:")


@dataclass(frozen=True, slots=True)
class TTSSegmentDecision:
    text: str
    reason: str


class SafeTTSStreamSegmenter:
    """Split streaming text only at punctuation boundaries.

    ``feed`` may receive arbitrary LLM chunk sizes. A punctuation mark at the
    end of a chunk is held until the next character so closing quotes and
    numeric separators can be classified without making chunk size observable.
    """

    def __init__(self, *, first_soft_chars: int = 8, later_soft_chars: int = 40):
        self._first_soft_chars = max(1, int(first_soft_chars))
        self._later_soft_chars = max(self._first_soft_chars, int(later_soft_chars))
        self._buffer = ""
        self._is_first_segment = True
        self._pending_kind: str | None = None
        self._pending_mark = ""
        self._pending_previous = ""

    def feed(self, text: str) -> list[TTSSegmentDecision]:
        decisions: list[TTSSegmentDecision] = []

        for char in str(text or ""):
            if self._pending_kind:
                if char in _CLOSING_MARKS or (
                    self._pending_kind == "hard" and char in _HARD_ENDINGS
                ):
                    self._append(char)
                    continue

                decision = self._finalize_pending(next_char=char)
                if decision:
                    decisions.append(decision)

            self._append(char)
            if char in _HARD_ENDINGS:
                self._set_pending("hard", char)
            elif char in _SOFT_ENDINGS:
                self._set_pending("soft", char)

        return decisions

    def finish(self) -> list[TTSSegmentDecision]:
        decisions: list[TTSSegmentDecision] = []
        if self._pending_kind:
            decision = self._finalize_pending(next_char=None)
            if decision:
                decisions.append(decision)

        residual = self._buffer.strip()
        if residual:
            decisions.append(self._emit("turn_end"))
        return decisions

    def _append(self, char: str) -> None:
        if char.isspace():
            if self._buffer and not self._buffer.endswith(" "):
                self._buffer += " "
            return
        self._buffer += char

    def _set_pending(self, kind: str, mark: str) -> None:
        self._pending_kind = kind
        self._pending_mark = mark
        self._pending_previous = self._buffer[-2] if len(self._buffer) >= 2 else ""

    def _finalize_pending(self, *, next_char: str | None) -> TTSSegmentDecision | None:
        kind = self._pending_kind
        mark = self._pending_mark
        previous = self._pending_previous
        self._pending_kind = None
        self._pending_mark = ""
        self._pending_previous = ""

        if (
            kind == "soft"
            and mark in _NUMERIC_SEPARATORS
            and previous.isdigit()
            and next_char is not None
            and next_char.isdigit()
        ):
            return None

        if kind == "hard":
            return self._emit("hard_end")

        threshold = self._first_soft_chars if self._is_first_segment else self._later_soft_chars
        if kind == "soft" and len(self._buffer.strip()) >= threshold:
            return self._emit("first_soft" if self._is_first_segment else "long_soft")
        return None

    def _emit(self, reason: str) -> TTSSegmentDecision:
        text = self._buffer.strip()
        self._buffer = ""
        self._is_first_segment = False
        return TTSSegmentDecision(text=text, reason=reason)
