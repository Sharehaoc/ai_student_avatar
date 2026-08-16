from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import UUID


_METADATA_FIELDS = frozenset({
    "tenant_id",
    "conversation_id",
    "visitor_user_id",
    "persona_version_id",
})


def _uuid(value: object, name: str) -> str:
    normalized = str(value or "").strip()
    try:
        UUID(normalized)
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError(f"{name} must be a UUID") from error
    return normalized


@dataclass(frozen=True, slots=True)
class DispatchMetadata:
    tenant_id: str
    conversation_id: str
    visitor_user_id: str
    persona_version_id: str

    @classmethod
    def from_json(cls, raw: str) -> "DispatchMetadata":
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as error:
            raise ValueError("invalid voice metadata JSON") from error
        if not isinstance(payload, dict) or set(payload) != _METADATA_FIELDS:
            raise ValueError("voice metadata contains invalid fields")
        return cls(
            tenant_id=_uuid(payload["tenant_id"], "tenant_id"),
            conversation_id=_uuid(payload["conversation_id"], "conversation_id"),
            visitor_user_id=_uuid(payload["visitor_user_id"], "visitor_user_id"),
            persona_version_id=_uuid(payload["persona_version_id"], "persona_version_id"),
        )

    def assert_matches(self, other: "DispatchMetadata") -> None:
        if self != other:
            raise ValueError("participant and dispatch metadata mismatch")
