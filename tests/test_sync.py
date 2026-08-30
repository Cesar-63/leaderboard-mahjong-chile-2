import unittest

from scripts.majsoul import PaipuError, extract_record_id, extract_uuid
from scripts.sync import CALENDAR_VALUE_COLS, SESSION_G1_ROWS, normalize_nat


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


if __name__ == "__main__":
    unittest.main()
