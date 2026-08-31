import unittest
from unittest.mock import patch

from scripts.majsoul import PaipuError, extract_record_id, extract_uuid, has_yostar_credentials
from scripts.sync import CALENDAR_VALUE_COLS, SESSION_G1_ROWS, advanced_stats_health, normalize_nat


class SyncTests(unittest.TestCase):
    def test_extracts_uuid_with_account_trailer(self):
        value = "https://game.maj-soul.com/1/?paipu=260830-12345678-abcd-4321-abcd-1234567890ab_a123"
        self.assertEqual(extract_uuid(value), "260830-12345678-abcd-4321-abcd-1234567890ab")
        self.assertEqual(extract_record_id(value), "260830-12345678-abcd-4321-abcd-1234567890ab_a123")

    def test_rejects_non_paipu(self):
        with self.assertRaises(PaipuError):
            extract_uuid("https://example.com/not-a-paipu")

    def test_calendar_has_168_slots(self):
        self.assertEqual(len(SESSION_G1_ROWS) * sum(len(v) for v in CALENDAR_VALUE_COLS.values()) * 2, 168)

    def test_nationalities_are_normalized(self):
        self.assertEqual(normalize_nat("Brasil/Brazil/Brasileira"), "BR")
        self.assertEqual(normalize_nat("Méxicana"), "MX")
        self.assertEqual(normalize_nat("Chileno"), "CL")

    def test_yostar_credentials_require_all_three_values(self):
        with patch.dict("os.environ", {"MAJSOUL_UID": "uid", "MAJSOUL_TOKEN": "token"}, clear=True):
            self.assertFalse(has_yostar_credentials())
        with patch.dict("os.environ", {
            "MAJSOUL_UID": "uid", "MAJSOUL_TOKEN": "token", "MAJSOUL_DEVICE_ID": "device",
        }, clear=True):
            self.assertTrue(has_yostar_credentials())

    def _status(self, *statuses):
        return {"submissions": [{"key": f"K{i}", "cell": f"Calendario!C{i}", "status": s, "message": ""} for i, s in enumerate(statuses, start=1)]}

    def _stats(self, with_hands_per_player: list[bool]):
        return {"players": {f"P{i}": {"hands": 4 if h else 0, "statsReliable": False} for i, h in enumerate(with_hands_per_player, start=1)}}

    def test_health_flags_submitted_paipus_without_hands(self):
        health = advanced_stats_health(self._stats([False, False]), self._status("REQUIERE_AUTH", "REQUIERE_AUTH", "PENDIENTE"))
        self.assertEqual(health["with_hands"], 0)
        self.assertEqual(health["submitted"], 2)
        self.assertEqual(health["requiere_auth"], 2)
        self.assertTrue(health["submitted"] and not health["with_hands"])

    def test_health_reports_partial_stats(self):
        health = advanced_stats_health(self._stats([True, False]), self._status("PUBLICADO", "REQUIERE_AUTH"))
        self.assertEqual(health["with_hands"], 1)
        self.assertEqual(health["publicado"], 1)
        self.assertEqual(len(health["issues"]), 1)

    def test_health_not_failing_early_season_with_hands(self):
        health = advanced_stats_health(self._stats([True]), self._status("PUBLICADO"))
        self.assertGreater(health["with_hands"], 0)
        self.assertFalse(health["submitted"] and not health["with_hands"])


if __name__ == "__main__":
    unittest.main()
