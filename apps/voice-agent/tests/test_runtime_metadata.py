import json
import unittest

from voice_agent.runtime_metadata import DispatchMetadata


VALID = {
    "tenant_id": "11111111-1111-4111-8111-111111111111",
    "conversation_id": "22222222-2222-4222-8222-222222222222",
    "visitor_user_id": "33333333-3333-4333-8333-333333333333",
    "persona_version_id": "44444444-4444-4444-8444-444444444444",
}


class DispatchMetadataTests(unittest.TestCase):
    def test_accepts_only_server_issued_uuid_identifiers(self):
        parsed = DispatchMetadata.from_json(json.dumps(VALID))

        self.assertEqual(parsed.conversation_id, VALID["conversation_id"])

        with self.assertRaises(ValueError):
            DispatchMetadata.from_json(json.dumps({**VALID, "system_prompt": "attacker"}))
        with self.assertRaises(ValueError):
            DispatchMetadata.from_json(json.dumps({**VALID, "tenant_id": "not-a-uuid"}))

    def test_participant_and_dispatch_metadata_must_match(self):
        participant = DispatchMetadata.from_json(json.dumps(VALID))
        dispatch = DispatchMetadata.from_json(json.dumps(VALID))
        participant.assert_matches(dispatch)

        different = DispatchMetadata.from_json(json.dumps({
            **VALID,
            "conversation_id": "55555555-5555-4555-8555-555555555555",
        }))
        with self.assertRaisesRegex(ValueError, "metadata mismatch"):
            participant.assert_matches(different)


if __name__ == "__main__":
    unittest.main()
