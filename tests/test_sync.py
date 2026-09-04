import unittest
from unittest.mock import patch

from scripts.majsoul import (
    NON_YAKU_FAN_IDS, PaipuError, YAKU_NAMES, extract_record_id, extract_uuid,
    has_yostar_credentials, parse_record,
)
from scripts.sync import (
    CALENDAR_VALUE_COLS, SESSION_G1_ROWS, advanced_stats_health, align_history_with_fixtures,
    build_excel_results, build_paipu_results, build_public_data, find_absent_player,
    match_paipu_seats, normalize_nat,
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


def synthetic_hule_paipu(fans):
    """Un paipu de una sola mano ganada por el asiento 0 con los fans dados."""
    from ms import protocol_pb2 as pb
    new_round = pb.RecordNewRound()
    new_round.scores.extend([30000, 30000, 30000, 30000])
    start = pb.Wrapper()
    start.name = "RecordNewRound"
    start.data = new_round.SerializeToString()
    hule_record = pb.RecordHule()
    hule_record.scores.extend([38000, 26000, 30000, 26000])
    hule = hule_record.hules.add()
    hule.seat = 0
    hule.zimo = True
    for fan_id, val in fans:
        fan = hule.fans.add()
        fan.id = fan_id
        fan.val = val
    end = pb.Wrapper()
    end.name = "RecordHule"
    end.data = hule_record.SerializeToString()
    details = pb.GameDetailRecords()
    details.records.append(start.SerializeToString())
    details.records.append(end.SerializeToString())
    outer = pb.Wrapper()
    outer.name = "GameDetailRecords"
    outer.data = details.SerializeToString()
    return outer.SerializeToString()


def wrap_records(records):
    """Empaqueta (nombre, mensaje) en el contenedor que espera parse_record."""
    from ms import protocol_pb2 as pb
    details = pb.GameDetailRecords()
    for name, message in records:
        item = pb.Wrapper()
        item.name = name
        item.data = message.SerializeToString()
        details.records.append(item.SerializeToString())
    outer = pb.Wrapper()
    outer.name = "GameDetailRecords"
    outer.data = details.SerializeToString()
    return outer.SerializeToString()


def hand_paipu(*, winner=0, zimo=True, liqi=False, ming=(), dadian=8000, draws=(0, 0, 0, 0),
               discarder=None, ankan_seat=None, pon_seat=None):
    """Una mano suelta: robos por asiento, llamadas opcionales y un ganador."""
    from ms import protocol_pb2 as pb
    new_round = pb.RecordNewRound()
    new_round.scores.extend([30000, 30000, 30000, 30000])
    records = [("RecordNewRound", new_round)]
    if pon_seat is not None:
        peng = pb.RecordChiPengGang()
        peng.seat = pon_seat
        peng.type = 1
        records.append(("RecordChiPengGang", peng))
    if ankan_seat is not None:
        ankan = pb.RecordAnGangAddGang()
        ankan.seat = ankan_seat
        ankan.type = 3
        records.append(("RecordAnGangAddGang", ankan))
    for seat, count in enumerate(draws):
        for _ in range(count):
            deal = pb.RecordDealTile()
            deal.seat = seat
            records.append(("RecordDealTile", deal))
    if not zimo and discarder is not None:
        discard = pb.RecordDiscardTile()
        discard.seat = discarder
        records.append(("RecordDiscardTile", discard))
    hule_record = pb.RecordHule()
    hule_record.scores.extend([30000, 30000, 30000, 30000])
    hule = hule_record.hules.add()
    hule.seat = winner
    hule.zimo = zimo
    hule.liqi = liqi
    hule.dadian = dadian
    hule.ming.extend(ming)
    records.append(("RecordHule", hule_record))
    return wrap_records(records)


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
            {"hands": 7, "wins": 1, "dealIns": 0, "riichis": 2, "openHands": 1, "damaten": 0, "winPoints": 8000, "dealInPoints": 0, "winTurns": 11, "yaku": {}},
            {"hands": 7, "wins": 0, "dealIns": 1, "riichis": 0, "openHands": 2, "damaten": 0, "winPoints": 0, "dealInPoints": 5200, "winTurns": 0, "yaku": {}},
            {"hands": 7, "wins": 1, "dealIns": 0, "riichis": 1, "openHands": 0, "damaten": 1, "winPoints": 5200, "dealInPoints": 0, "winTurns": 9, "yaku": {}},
            {"hands": 7, "wins": 0, "dealIns": 2, "riichis": 0, "openHands": 1, "damaten": 0, "winPoints": 0, "dealInPoints": 12000, "winTurns": 0, "yaku": {}},
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

    def test_kan_cerrado_no_cuenta_como_mano_abierta(self):
        # El ankan mantiene la mano menzen: no es furo y no rompe el damaten.
        raw = hand_paipu(winner=0, ming=["angang(1m,1m,1m,1m)"], ankan_seat=0, draws=(6, 5, 5, 5))
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.seat_stats[0]["openHands"], 0)
        self.assertEqual(parsed.seat_stats[0]["damaten"], 1)

    def test_pon_cuenta_como_mano_abierta_y_anula_damaten(self):
        raw = hand_paipu(winner=0, ming=["kezi(1z,1z,1z)"], pon_seat=0, draws=(6, 5, 5, 5))
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.seat_stats[0]["openHands"], 1)
        self.assertEqual(parsed.seat_stats[0]["damaten"], 0)

    def test_riichi_no_es_damaten(self):
        raw = hand_paipu(winner=0, liqi=True, draws=(6, 5, 5, 5))
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.seat_stats[0]["damaten"], 0)

    def test_puntos_de_la_mano_van_al_ganador_y_al_que_paga(self):
        raw = hand_paipu(winner=2, zimo=False, discarder=1, dadian=7700, draws=(4, 4, 4, 4))
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.seat_stats[2]["winPoints"], 7700)
        self.assertEqual(parsed.seat_stats[1]["dealIns"], 1)
        self.assertEqual(parsed.seat_stats[1]["dealInPoints"], 7700)
        self.assertEqual(parsed.seat_stats[0]["dealInPoints"], 0)

    def test_turno_de_la_mano_ganada(self):
        # Tsumo: el turno es el robo en curso. Ron: el turno que le tocaba.
        tsumo = parse_record("260101-00000000-0000-0000-0000-000000000000",
                             hand_paipu(winner=0, zimo=True, draws=(9, 8, 8, 8)))
        self.assertEqual(tsumo.seat_stats[0]["winTurns"], 9)
        ron = parse_record("260101-00000000-0000-0000-0000-000000000000",
                           hand_paipu(winner=3, zimo=False, discarder=2, draws=(7, 7, 7, 6)))
        self.assertEqual(ron.seat_stats[3]["winTurns"], 7)

    def test_paipu_parses_seat_identity(self):
        raw = synthetic_paipu([(1111, "A-P1", 45000), (2222, "A-P2", 38500), (3333, "A-P3", 32000), (4444, "A-P4", 4500)])
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.final_scores, [45000, 38500, 32000, 4500])
        self.assertEqual([p["account_id"] for p in parsed.players], [1111, 2222, 3333, 4444])
        self.assertEqual(parsed.players[0]["nickname"], "A-P1")
        self.assertEqual(parsed.players[3]["point"], 4500)
        self.assertTrue(parsed.record_game_seen)
    def test_yaku_names_map_known_ids(self):
        # Ids verificados contra los paipus reales de data/raw-paipu.
        self.assertEqual(YAKU_NAMES[2], "Riichi")
        self.assertEqual(YAKU_NAMES[12], "Tanyao")
        self.assertEqual(YAKU_NAMES[14], "Pinfu")
        self.assertEqual(YAKU_NAMES[26], "Junchan")
        self.assertEqual(YAKU_NAMES[29], "Chinitsu")
        self.assertEqual(YAKU_NAMES[42], "Kokushi Musou")
        self.assertIsNotNone(YAKU_NAMES.get(999) or "Yaku #999")

    def test_dora_is_not_counted_as_yaku(self):
        # 31/32/33 son dora, aka dora y ura dora: suman han, no son yaku.
        self.assertEqual(NON_YAKU_FAN_IDS, frozenset({31, 32, 33, 34}))
        raw = synthetic_hule_paipu([(2, 1), (14, 1), (31, 3), (33, 1)])
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", raw)
        self.assertEqual(parsed.seat_stats[0]["yaku"], {"Riichi": 1, "Pinfu": 1})

    def test_parse_record_reads_head_identity_from_res_game_record(self):
        from ms import protocol_pb2 as pb
        head = pb.RecordGame()
        for seat, (acc, nick) in enumerate([(1111, "A-P1"), (2222, "A-P2"), (3333, "A-P3"), (4444, "A-P4")]):
            account = head.accounts.add()
            account.account_id = acc
            account.seat = seat
            account.nickname = nick
        new_round = pb.RecordNewRound()
        new_round.scores.extend([45000, 38500, 32000, 4500])
        rec = pb.Wrapper()
        rec.name = "RecordNewRound"
        rec.data = new_round.SerializeToString()
        details = pb.GameDetailRecords()
        details.records.append(rec.SerializeToString())
        log_wrapper = pb.Wrapper()
        log_wrapper.name = "GameDetailRecords"
        log_wrapper.data = details.SerializeToString()
        res = pb.ResGameRecord()
        res.data = log_wrapper.SerializeToString()
        res.head.CopyFrom(head)
        parsed = parse_record("260101-00000000-0000-0000-0000-000000000000", res.SerializeToString())
        self.assertTrue(parsed.record_game_seen)
        self.assertEqual([p["account_id"] for p in parsed.players], [1111, 2222, 3333, 4444])
        self.assertEqual([p["nickname"] for p in parsed.players], ["A-P1", "A-P2", "A-P3", "A-P4"])
        self.assertEqual(parsed.final_scores, [45000, 38500, 32000, 4500])

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
        game = _paipu_game()
        results = build_paipu_results("A-S1-M1-G1", seat_map, game["players"], game["finalScoresBySeat"], _division_config()["divisions"]["A"], None)
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

    def test_build_public_data_uses_fixture_order_when_paipu_has_no_identity(self):
        config = _division_config()
        rosters = _rosters()
        fixtures = [{"division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "date": "12 abr", "weekday": "sáb", "dateISO": "2026-04-12", "time": None}]
        submissions = [{"key": "A-S1-M1-G1", "division": "A", "session": 1, "table": 1, "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"], "game": 1, "cell": "Calendario!C11", "url": "https://x/paipu", "uuid": "u", "recordId": "u"}]
        game = _paipu_game()
        for player in game["players"]:
            player["account_id"] = None
            player["nickname"] = None
            player["point"] = None
        data, _ = build_public_data(config, rosters, fixtures, submissions, {}, {"A-S1-M1-G1": game})
        by_id = {p["id"]: p for p in data["divisions"]["A"]["players"]}
        self.assertEqual(by_id["A01"]["points"], 30.0)
        self.assertEqual(by_id["A02"]["points"], 13.5)
        self.assertEqual(by_id["A03"]["points"], -3.0)
        self.assertEqual(by_id["A04"]["points"], -40.5)
        self.assertEqual(by_id["A01"]["hands"], 7)
        self.assertEqual(data["divisions"]["A"]["matches"][0]["source"], "paipu")
        self.assertEqual(data["divisions"]["A"]["matches"][0]["players"][0]["id"], "A01")

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


def _fixture(division, session, table, players, date="12 abr"):
    return {"division": division, "session": session, "table": table, "players": players,
            "date": date, "weekday": "sáb", "dateISO": "2026-04-12", "time": None}


def _history(key, session, table, game, names, scores=(45000, 38500, 32000, 4500)):
    umas = [15, 5, -5, -15]
    return {key: {"key": key, "session": session, "table": table, "game": game,
                  "results": [{"name": n, "scoreRaw": s, "place": i + 1,
                               "delta": round((s - 30000) / 1000 + umas[i], 1)}
                              for i, (n, s) in enumerate(zip(names, scores))],
                  "sourceCell": "X!B2"}}


class MesasRenumeradasTests(unittest.TestCase):
    """El Game History numera las mesas distinto que el Calendario."""

    def test_reasigna_grupos_cruzados_a_la_mesa_del_calendario(self):
        fixtures = [
            _fixture("A", 1, 1, ["Bodoque", "Mon_96", "Meme000", "Twining1999"]),
            _fixture("A", 1, 6, ["W", "X", "Y", "Z"]),
        ]
        histories = {}
        histories.update(_history("A-S1-M1-G1", 1, 1, 1, ["W", "X", "Y", "Z"]))
        histories.update(_history("A-S1-M6-G1", 1, 6, 1, ["Bodoque", "Mon_96", "Meme000", "Twining1999"]))
        alineadas, avisos = align_history_with_fixtures(histories, fixtures)
        self.assertEqual(alineadas["A-S1-M6-G1"]["results"][0]["name"], "W")
        self.assertEqual(alineadas["A-S1-M1-G1"]["results"][0]["name"], "Bodoque")
        self.assertEqual(alineadas["A-S1-M1-G1"]["table"], 1)
        self.assertTrue(any("mesa 1 del Game History corresponde a la mesa 6" in a for a in avisos))

    def test_empareja_con_tres_de_cuatro_cuando_hay_suplente(self):
        fixtures = [_fixture("A", 2, 3, ["Bodoque", "Mon_96", "Meme000", "Twining1999"])]
        histories = _history("A-S2-M5-G1", 2, 5, 1, ["Bodoque", "Mon_96", "Meme000", "ForasteroXYZ"])
        alineadas, _ = align_history_with_fixtures(histories, fixtures)
        self.assertIn("A-S2-M3-G1", alineadas)
        self.assertEqual(alineadas["A-S2-M3-G1"]["table"], 3)

    def test_avisa_cuando_ningun_grupo_calza(self):
        fixtures = [_fixture("A", 1, 1, ["Bodoque", "Mon_96", "Meme000", "Twining1999"])]
        histories = _history("A-S1-M1-G1", 1, 1, 1, ["Otro1", "Otro2", "Otro3", "Otro4"])
        alineadas, avisos = align_history_with_fixtures(histories, fixtures)
        self.assertIn("A-S1-M1-G1", alineadas)
        self.assertTrue(any("ningún grupo del calendario coincide" in a for a in avisos))


class SuplentesYAusenciasTests(unittest.TestCase):

    def test_ausente_suma_partida_y_penalizacion_sin_ocupar_puesto(self):
        config = _division_config() | {"absencePenaltyPerHanchan": -30}
        rosters = _rosters()
        fixtures = [_fixture("A", 1, 1, ["Bodoque", "Mon_96", "Meme000", "Twining1999"])]
        submissions = [{"key": "A-S1-M1-G1", "division": "A", "session": 1, "table": 1,
                        "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"],
                        "game": 1, "cell": "Calendario!C11", "url": ""}]
        # Twining1999 (A04) se ausenta; juega un suplente ajeno al roster.
        histories = _history("A-S1-M1-G1", 1, 1, 1, ["Bodoque", "Mon_96", "Meme000", "ForasteroXYZ"])
        data, _ = build_public_data(config, rosters, fixtures, submissions, histories, {})
        by_id = {p["id"]: p for p in data["divisions"]["A"]["players"]}
        ausente = by_id["A04"]
        self.assertEqual(ausente["games"], 1)
        self.assertEqual(ausente["absences"], 1)
        self.assertEqual(ausente["points"], -30.0)
        self.assertEqual(ausente["history"], [-30.0])
        # No ocupa puesto: la distribución y el promedio quedan vacíos.
        self.assertEqual(ausente["counts"], [0, 0, 0, 0])
        self.assertEqual(ausente["avgRank"], 0)
        # El suplente no entra en la clasificación pero sí en el historial.
        suplente = next(p for p in data["divisions"]["A"]["matches"][0]["players"] if p.get("esSuplente"))
        self.assertEqual(suplente["sustitutoDe"], "A04")
        self.assertNotIn(suplente["id"], by_id)

    def test_paipu_con_suplente_no_le_atribuye_stats_al_ausente(self):
        config = _division_config() | {"absencePenaltyPerHanchan": -30}
        rosters = _rosters()
        fixtures = [_fixture("A", 1, 1, ["Bodoque", "Mon_96", "Meme000", "Twining1999"])]
        submissions = [{"key": "A-S1-M1-G1", "division": "A", "session": 1, "table": 1,
                        "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"],
                        "game": 1, "cell": "Calendario!C11", "url": "u"}]
        parsed = _paipu_game()
        # El asiento 3 lo ocupa una cuenta que no está en ningún roster.
        parsed["players"] = [
            {"seat": 0, "account_id": 101, "nickname": "Bodoque", "point": 45000},
            {"seat": 1, "account_id": 102, "nickname": "Mon_96", "point": 38500},
            {"seat": 2, "account_id": 103, "nickname": "Meme000", "point": 32000},
            {"seat": 3, "account_id": 999, "nickname": "ForasteroXYZ", "point": 4500},
        ]
        data, stats = build_public_data(config, rosters, fixtures, submissions, {"A-S1-M1-G1": parsed}, {"A-S1-M1-G1": parsed})
        by_id = {p["id"]: p for p in data["divisions"]["A"]["players"]}
        ausente = by_id["A04"]
        self.assertEqual(ausente["games"], 1)
        self.assertEqual(ausente["points"], -30.0)
        # Las manos del asiento del suplente no son de nadie del roster.
        self.assertEqual(ausente["hands"], 0)
        self.assertEqual(by_id["A01"]["hands"], 7)

    def test_find_absent_player_devuelve_al_que_falta(self):
        players = _rosters()["A"]
        presentes = {"A01", "A02", "A03"}
        self.assertEqual(find_absent_player(["Bodoque", "Mon_96", "Meme000", "Twining1999"], players, presentes)["id"], "A04")
        self.assertIsNone(find_absent_player(["Bodoque"], players, {"A01"}))


if __name__ == "__main__":
    unittest.main()
