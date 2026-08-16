from __future__ import annotations

from collections.abc import AsyncIterable, AsyncIterator


_THINKING_MARKERS = {
    "（思考：": "）",
    "（思考:": "）",
    "(思考：": ")",
    "(思考:": ")",
}
_SCRIPT_MARKERS = ("用戶:", "用户:", "User:", "使用者:", "USER:")
_ALL_MARKERS = tuple((*_THINKING_MARKERS, *_SCRIPT_MARKERS))
_MARKER_HOLD = max(len(marker) for marker in _ALL_MARKERS) - 1


def _earliest_marker(buffer: str) -> tuple[int, str] | None:
    matches = [
        (position, marker)
        for marker in _ALL_MARKERS
        if (position := buffer.find(marker)) >= 0
    ]
    return min(matches, default=None, key=lambda match: match[0])


async def safety_filter(text: AsyncIterable[str]) -> AsyncIterator[str]:
    """Remove hidden thinking and stop dialogue scripts across arbitrary chunks."""
    buffer = ""
    thinking_close: str | None = None

    async for chunk in text:
        buffer += str(chunk or "")
        while buffer:
            if thinking_close is not None:
                close_at = buffer.find(thinking_close)
                if close_at < 0:
                    buffer = ""
                    break
                buffer = buffer[close_at + len(thinking_close):]
                thinking_close = None
                continue

            match = _earliest_marker(buffer)
            if match is not None:
                position, marker = match
                if position:
                    yield buffer[:position]
                buffer = buffer[position + len(marker):]
                if marker in _SCRIPT_MARKERS:
                    return
                thinking_close = _THINKING_MARKERS[marker]
                continue

            if len(buffer) <= _MARKER_HOLD:
                break
            yield buffer[:-_MARKER_HOLD]
            buffer = buffer[-_MARKER_HOLD:]
            break

    if buffer and thinking_close is None:
        yield buffer
