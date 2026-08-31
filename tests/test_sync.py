import unittest
from unittest.mock import patch

from scripts.majsoul import PaipuError, extract_record_id, extract_uuid, has_yostar_credentials, parse_record
from scripts.sync import (
    CALENDAR_VALUE_COLS, SESSION_G1_ROWS, advanced_stats_health, build_excel_results,
    build_paipu_results, build_public_data, match_paipu_seats, normalize_nat,
)


def synthetic_paipu(accounts):
    from ms import protocol_pb2 as pb
    record_game = pb.RecordGame()
    for seat, (account_id, nickname, point) in enumerate(accounts):
        account = record_game.accounts.add()
        account.account_id = account_id
        account.seat = seat
        account.nickname = nickname
        result = record_game.result.players.add()
        result.seat = seat
        result.total_point = point
    inner = pb.Wrapper()
    inner.name = "RecordGame"
    inner.data = record_game.SerializeToString()
    details = pb.GameDetailRecords()
    details.records.append(inner.SerializeToString())
    outer = pb.Wrapper()
    outer.name = "GameDetailRecords"
    outer.data = details.SerializeToString()
    return outer.SerializeToString()


def _division_config():
    return {
        "divisions": {
            "A": {"initialPoints": 30000, "uma": [15, 5, -5, -15]},
            "B": {"initialPoints": 30000, "uma": [35, 5, -10, -30]},
        },
        "sessionsTotal": 7,
        "minimumAdvancedStatsHands": 8,
        "seasonLabel": "T",
    }


def _rosters():
    def player(pid, name, account_id, nat):
        return {"id": pid, "div": pid[0], "num": pid[1:], "name": name, "shortName": name, "handle": name, "accountId": account_id, "discord": "", "nat": nat}
    return {
        "A": [
            player("A01", "Bodoque", 101, "CL"), player("A02", "Mon_96", 102, "CL"),
            player("A03", "Meme000", 103, "CL"), player("A04", "Twining1999", 104, "CL"),
        ],
        "B": [
            player("B01", "X", 201, "AR"), player("B02", "Y", 202, "AR"),
            player("B03", "Z", 203, "AR"), player("B04", "W", 204, "AR"),
        ],
    }


def _paipu_game():
    return {
        "uuid": "u", "url": "https://x/paipu", "sha256": "x",
        "finalScoresBySeat": [45000, 38500, 32000, 4500],
        "seatStats": [
            {"hands": 7, "wins": 1, "dealIns": 0, "riichis": 2, "openHands": 1, "yaku": {}},
            {"hands": 7, "wins": 0, "dealIns": 1, "riichis": 0, "openHands": 2, "yaku": {}},
            {"hands": 7, "wins": 1, "dealIns": 0, "riichis": 1, "openHands": 0, "yaku": {}},
            {"hands": 7, "wins": 0, "dealIns": 2, "riichis": 0, "openHands": 1, "yaku": {}},
        ],
        "players": [
            {"seat": 0, "account_id": 103, "nickname": "Meme000", "point": 45000},
            {"seat": 1, "account_id": 101, "nickname": "Bodoque", "point": 38500},
            {"seat": 2, "account_id": 104, "nickname": "Twining1999", "point": 32000},
            {"seat": 3, "account_id": 102, "nickname": "Mon_96", "point": 4500},
        ],
        "hands": 7, "status": "PUBLICADO",
    }


def _excel_game():
    return {
        "key": "A-S1-M1-G1", "session": 1, "table": 1, "game": 1,
        "results": [
            {"name": "Bodoque", "scoreRaw": 45000, "place": 1, "delta": 30.0},
            {"name": "Meme000", "scoreRaw": 38500, "place": 2, "delta": 13.5},
            {"name": "Twining1999", "scoreRaw": 32000, "place": 3, "delta": -3.0},
            {"name": "Mon_96", "scoreRaw": 4500, "place": 4, "delta": -40.5},
        ],
        "sourceCell": "Game History A!B2",
    }


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

    def test_paipu_parses_seat_identity(self):
        raw = synthetic_paipu([(1111, "A-P1", 45000), (2222, "A-P2", 38500), (3333, "A-P3", 32000), (4444, "A-P4", 4500)])
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.final_scores, [45000, 38500, 32000, 4500])
        self.assertEqual([p["account_id"] for p in parsed.players], [1111, 2222, 3333, 4444])
        self.assertEqual(parsed.players[0]["nickname"], "A-P1")
        self.assertEqual(parsed.players[3]["point"], 4500)

    def test_match_paipu_seats_is_order_agnostic(self):
        players = _rosters()["A"]
        parsed_players = _paipu_game()["players"]
        seat_map = match_paipu_seats(parsed_players, players)
        self.assertEqual({p["id"] for p in seat_map.values()}, {p["id"] for p in players})
        self.assertEqual(seat_map[0]["id"], "A03")
        self.assertEqual(seat_map[1]["id"], "A01")
        self.assertEqual(seat_map[3]["id"], "A02")

    def test_build_paipu_results_computes_delta_and_place(self):
        players = _rosters()["A"]
        seat_map = match_paipu_seats(_paipu_game()["players"], players)
        results = build_paipu_results(seat_map, _paipu_game()["finalScoresBySeat"], _division_config()["divisions"]["A"])
        by_id = {r["id"]: r for r in results}
        self.assertEqual(by_id["A03"]["place"], 1)
        self.assertEqual(by_id["A03"]["delta"], 30.0)
        self.assertEqual(by_id["A01"]["place"], 2)
        self.assertEqual(by_id["A02"]["delta"], -40.5)

    def test_build_public_data_prefers_paipu_over_excel(self):
        config = _division_config()
        rosters = _rosters()
        fixtures = [
            {"division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "date": "12 abr", "weekday": "sáb", "dateISO": "2026-04-12", "time": None},
            {"division": "B", "session": 1, "table": 1, "players": ["X", "Y", "Z", "W"], "date": "12 abr", "weekday": "sáb", "dateISO": "2026-04-12", "time": None},
        ]
        submissions = [
            {"key": "A-S1-M1-G1", "division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "game": 1, "cell": "Calendario!C11", "url": "https://x/paipu", "uuid": "u", "recordId": "u"},
            {"key": "B-S1-M1-G1", "division": "B", "session": 1, "table": 1, "players": ["X", "Y", "Z", "W"], "game": 1, "cell": "Calendario!V11", "url": "", "uuid": None, "recordId": None},
        ]
        histories = {"A-S1-M1-G1": _excel_game()}
        parsed_games = {"A-S1-M1-G1": _paipu_game()}
        data, _ = build_public_data(config, rosters, fixtures, submissions, histories, parsed_games)
        by_id = {p["id"]: p for p in data["divisions"]["A"]["players"]}
        self.assertEqual(by_id["A03"]["points"], 30.0)
        self.assertEqual(by_id["A01"]["points"], 13.5)
        self.assertEqual(by_id["A03"]["hands"], 7)
        self.assertEqual(by_id["A03"]["winRate"], 14.3)
        match = data["divisions"]["A"]["matches"][0]
        self.assertEqual(match["source"], "paipu")
        self.assertEqual(match["players"][0]["id"], "A03")

    def test_build_public_data_falls_back_to_excel_without_paipu(self):
        config = _division_config()
        rosters = _rosters()
        fixtures = [
            {"division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "date": "12 abr", "weekday": "sáb", "dateISO": "2026-04-12", "time": None},
        ]
        submissions = [{"key": "A-S1-M1-G1", "division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "game": 1, "cell": "Calendario!C11", "url": ""}]
        histories = {"A-S1-M1-G1": _excel_game()}
        data, _ = build_public_data(config, rosters, fixtures, submissions, histories, {})
        by_id = {p["id"]: p for p in data["divisions"]["A"]["players"]}
        self.assertEqual(by_id["A01"]["points"], 30.0)
        self.assertEqual(by_id["A03"]["points"], 13.5)
        self.assertEqual(data["divisions"]["A"]["matches"][0]["source"], "excel")


if __name__ == "__main__":
    unittest.main()
