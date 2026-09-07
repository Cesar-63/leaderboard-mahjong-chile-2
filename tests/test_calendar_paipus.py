import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from scripts.majsoul import ContestGame, pending_record_uuids
from scripts.fill_calendar_paipus import (
    MIN_PLAYER_OVERLAP, apply_writes, build_report, build_tables, index_roster, log_candidates,
    match_games, paipu_url, planned_writes, writable_rows,
)


UTC = timezone.utc


def player(pid, name, account_id):
    return {"id": pid, "div": pid[0], "num": pid[1:], "name": name, "shortName": name,
            "handle": name, "accountId": account_id, "discord": "", "nat": "CL"}


def roster_a():
    return [
        player("A01", "Bodoque", 101), player("A02", "Mon_96", 102),
        player("A03", "Meme000", 103), player("A04", "Twining1999", 104),
        player("A05", "Kaiser", 105), player("A06", "Nozomi", 106),
        player("A07", "Tanuki", 107), player("A08", "Sora", 108),
    ]


def cells(division, session, table, urls):
    """Las cuatro celdas que `read_calendar` emite para una mesa (G1 y G2)."""
    columns = {1: "C", 2: "F"}
    rows = {1: 11, 2: 19}
    entries = []
    for game in (1, 2):
        entries.append({
            "key": f"{division}-S{session}-M{table}-G{game}",
            "division": division, "session": session, "table": table,
            "players": urls["players"], "date": urls["date"], "weekday": "sáb",
            "dateISO": urls["dateISO"], "time": "20:00", "game": game,
            "cell": f"Calendario!{columns[table]}{rows[session] + game - 1}",
            "url": urls.get(game, ""),
        })
        if urls.get(game):
            entries[-1]["uuid"] = urls[game].split("paipu=")[1].split("_a")[0]
    return entries


def contest_game(uuid, start, accounts, division="A"):
    seats = [
        {"seat": seat, "accountId": account_id, "nickname": nickname, "scoreRaw": 30000}
        for seat, (account_id, nickname) in enumerate(accounts)
    ]
    return ContestGame(uuid=uuid, contestId="12345", division=division,
                       startTime=start, endTime=start + 3600, seats=seats)


MESA_1 = [(101, "Bodoque"), (102, "Mon_96"), (103, "Meme000"), (104, "Twining1999")]
MESA_2 = [(105, "Kaiser"), (106, "Nozomi"), (107, "Tanuki"), (108, "Sora")]


class CalendarFixture:
    """Dos mesas de la sesión 1 de División A, con su roster y su reporte."""

    def setUp(self):
        self.indexes = {"A": index_roster(roster_a())}
        self.submissions = (
            cells("A", 1, 1, {"players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"],
                              "date": "10 jul", "dateISO": "2026-07-10"})
            + cells("A", 1, 2, {"players": ["Kaiser", "Nozomi", "Tanuki", "Sora"],
                                "date": "10 jul", "dateISO": "2026-07-10"})
        )
        self.tables = build_tables(self.submissions)

    def report_for(self, games, submissions=None):
        tables = build_tables(submissions) if submissions else self.tables
        matched, issues = match_games(tables, games, self.indexes, UTC)
        return build_report(tables, matched, issues, {"A": "12345"}, games, self.indexes, UTC)

    def rows_by_key(self, report):
        return {row["key"]: row for row in report["proposals"]}


class CalendarPaipuTests(CalendarFixture, unittest.TestCase):

    def test_game_1_es_la_partida_mas_temprana(self):
        tarde = contest_game("260710-bbbb", 1_760_000_000 + 7200, MESA_1)
        temprano = contest_game("260710-aaaa", 1_760_000_000, MESA_1)
        rows = self.rows_by_key(self.report_for([tarde, temprano]))
        self.assertEqual(rows["A-S1-M1-G1"]["uuid"], "260710-aaaa")
        self.assertEqual(rows["A-S1-M1-G2"]["uuid"], "260710-bbbb")
        self.assertEqual(rows["A-S1-M1-G1"]["status"], "PROPUESTO")
        self.assertEqual(rows["A-S1-M1-G1"]["cell"], "Calendario!C11")
        self.assertEqual(rows["A-S1-M1-G2"]["cell"], "Calendario!C12")

    def test_tres_jugadores_bastan_con_un_sustituto(self):
        con_sustituto = [*MESA_1[:3], (999, "SustitutoRandom")]
        rows = self.rows_by_key(self.report_for([contest_game("260710-cccc", 1_760_000_000, con_sustituto)]))
        self.assertEqual(rows["A-S1-M1-G1"]["status"], "PROPUESTO")
        self.assertEqual(rows["A-S1-M1-G1"]["matchedPlayers"], MIN_PLAYER_OVERLAP)

    def test_dos_jugadores_no_alcanzan(self):
        pocos = [*MESA_1[:2], (998, "Otro"), (999, "Otro2")]
        report = self.report_for([contest_game("260710-dddd", 1_760_000_000, pocos)])
        self.assertEqual(self.rows_by_key(report)["A-S1-M1-G1"]["status"], "PENDIENTE")
        self.assertEqual([issue["type"] for issue in report["issues"] if issue["uuid"]], ["SIN_MESA"])

    def test_no_sobrescribe_una_celda_con_otro_paipu(self):
        ocupada = cells("A", 1, 1, {
            "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"],
            "date": "10 jul", "dateISO": "2026-07-10",
            1: "https://mahjongsoul.game.yo-star.com/?paipu=260710-zzzz_a101",
        }) + cells("A", 1, 2, {"players": ["Kaiser", "Nozomi", "Tanuki", "Sora"],
                               "date": "10 jul", "dateISO": "2026-07-10"})
        report = self.report_for([contest_game("260710-aaaa", 1_760_000_000, MESA_1)], ocupada)
        row = self.rows_by_key(report)["A-S1-M1-G1"]
        self.assertEqual(row["status"], "CONFLICTO")
        self.assertIsNone(row["value"])
        self.assertEqual(row["existingUrl"], "https://mahjongsoul.game.yo-star.com/?paipu=260710-zzzz_a101")

    def test_celda_con_el_mismo_paipu_queda_ok(self):
        ya_cargada = cells("A", 1, 1, {
            "players": ["Bodoque", "Mon_96", "Meme000", "Twining1999"],
            "date": "10 jul", "dateISO": "2026-07-10",
            1: "https://mahjongsoul.game.yo-star.com/?paipu=260710-aaaa_a101",
        }) + cells("A", 1, 2, {"players": ["Kaiser", "Nozomi", "Tanuki", "Sora"],
                               "date": "10 jul", "dateISO": "2026-07-10"})
        report = self.report_for([contest_game("260710-aaaa", 1_760_000_000, MESA_1)], ya_cargada)
        self.assertEqual(self.rows_by_key(report)["A-S1-M1-G1"]["status"], "OK")

    def test_mesa_con_tres_partidas_queda_para_revisar(self):
        games = [
            contest_game("260710-aaaa", 1_760_000_000, MESA_1),
            contest_game("260710-bbbb", 1_760_003_600, MESA_1),
            contest_game("260710-cccc", 1_760_007_200, MESA_1),
        ]
        report = self.report_for(games)
        rows = self.rows_by_key(report)
        self.assertEqual(rows["A-S1-M1-G1"]["status"], "REVISAR")
        self.assertEqual(rows["A-S1-M1-G1"]["uuid"], "260710-aaaa")
        self.assertIn("MESA_CON_EXTRAS", [issue["type"] for issue in report["issues"]])

    def test_empate_entre_mesas_se_desempata_por_fecha(self):
        # El mismo trío en dos sesiones distintas: solo la fecha las separa.
        submissions = (
            cells("A", 1, 1, {"players": ["Bodoque", "Mon_96", "Meme000", "Kaiser"],
                              "date": "10 jul", "dateISO": "2026-07-10"})
            + cells("A", 2, 1, {"players": ["Bodoque", "Mon_96", "Meme000", "Nozomi"],
                                "date": "17 jul", "dateISO": "2026-07-17"})
        )
        trio = [*MESA_1[:3], (997, "Invitado")]
        jugada = int(datetime(2026, 7, 17, 21, 0, tzinfo=UTC).timestamp())
        game = contest_game("260717-aaaa", jugada, trio)
        rows = self.rows_by_key(self.report_for([game], submissions))
        self.assertEqual(rows["A-S2-M1-G1"]["status"], "PROPUESTO")
        self.assertEqual(rows["A-S1-M1-G1"]["status"], "PENDIENTE")

    def test_url_propuesta_va_sin_ancla(self):
        game = contest_game("260710-aaaa", 1_760_000_000, MESA_1)
        self.assertEqual(
            paipu_url(game),
            "https://mahjongsoul.game.yo-star.com/?paipu=260710-aaaa",
        )


class FakeSheets:
    """Planilla de mentira: contesta lo que tiene y anota lo que le escriben."""

    def __init__(self, current=None):
        self.current = dict(current or {})
        self.written = {}
        self.spreadsheet_id = "planilla-de-prueba"
        self.account_email = "bot@liga.iam.gserviceaccount.com"

    def read_cells(self, ranges):
        return {cell: self.current.get(cell, "") for cell in ranges}

    def write_cells(self, updates):
        self.current.update(updates)
        self.written.update(updates)
        return len(updates)


class EscrituraEnLaPlanillaTests(CalendarFixture, unittest.TestCase):
    """`--write`: qué celdas pega el script y cuáles deja para un humano."""

    def dos_partidas(self):
        return [
            contest_game("260710-aaaa", 1_760_000_000, MESA_1),
            contest_game("260710-bbbb", 1_760_003_600, MESA_1),
        ]

    def test_write_pega_las_celdas_propuestas(self):
        report = self.report_for(self.dos_partidas())
        rows = writable_rows(report, include_review=False)
        client = FakeSheets()
        resumen = apply_writes(client, rows)
        self.assertEqual(resumen["written"], 2)
        self.assertEqual(client.written, {
            "Calendario!C11": "https://mahjongsoul.game.yo-star.com/?paipu=260710-aaaa",
            "Calendario!C12": "https://mahjongsoul.game.yo-star.com/?paipu=260710-bbbb",
        })
        self.assertEqual({row["writeOutcome"] for row in rows}, {"ESCRITO"})

    def test_write_deja_revisar_para_un_humano(self):
        games = self.dos_partidas() + [contest_game("260710-cccc", 1_760_007_200, MESA_1)]
        report = self.report_for(games)
        self.assertEqual(writable_rows(report, include_review=False), [])
        self.assertEqual(len(writable_rows(report, include_review=True)), 2)

    def test_write_no_pisa_una_celda_llenada_en_el_medio(self):
        # La copia descargada la vio vacía, pero alguien la completó antes del
        # batchUpdate: se releen las celdas y esa no se toca.
        report = self.report_for(self.dos_partidas())
        rows = writable_rows(report, include_review=False)
        ocupada = "https://mahjongsoul.game.yo-star.com/?paipu=260710-zzzz_a101"
        client = FakeSheets({"Calendario!C11": ocupada})
        resumen = apply_writes(client, rows)
        self.assertEqual(resumen["written"], 1)
        self.assertEqual(resumen["skipped"], 1)
        self.assertNotIn("Calendario!C11", client.written)
        self.assertEqual(client.current["Calendario!C11"], ocupada)
        self.assertEqual(rows[0]["writeOutcome"], "OMITIDO")

    def test_write_reconoce_la_celda_que_ya_tiene_ese_paipu(self):
        report = self.report_for(self.dos_partidas())
        rows = writable_rows(report, include_review=False)
        client = FakeSheets({
            "Calendario!C11": "https://mahjongsoul.game.yo-star.com/?paipu=260710-aaaa_a101",
        })
        resumen = apply_writes(client, rows)
        self.assertEqual((resumen["already"], resumen["skipped"], resumen["written"]), (1, 0, 1))
        self.assertEqual(rows[0]["writeOutcome"], "OK")

    def test_sin_write_es_un_simulacro(self):
        report = self.report_for(self.dos_partidas())
        rows = writable_rows(report, include_review=False)
        resumen = planned_writes(rows)
        self.assertEqual((resumen["mode"], resumen["attempted"], resumen["written"]),
                         ("simulacro", 2, 0))
        self.assertEqual({row["writeOutcome"] for row in rows}, {"SIMULADO"})

    def test_los_logs_priorizan_lo_que_se_va_a_pegar(self):
        submissions = cells("A", 1, 2, {
            "players": ["Kaiser", "Nozomi", "Tanuki", "Sora"],
            "date": "10 jul", "dateISO": "2026-07-10",
            1: "https://mahjongsoul.game.yo-star.com/?paipu=260710-vieja_a101",
        })
        report = self.report_for(self.dos_partidas())
        rows = writable_rows(report, include_review=False)
        self.assertEqual(
            log_candidates(rows, submissions),
            ["260710-aaaa", "260710-bbbb", "260710-vieja"],
        )


class LogsFaltantesTests(unittest.TestCase):
    """Qué paipus cuenta el script como faltantes en `data/raw-paipu`."""

    def test_solo_faltan_los_que_no_estan_en_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            (cache / "260710-aaaa.pb").write_bytes(b"\x0a\x0bRecordGame")
            # Una respuesta "requiere sesión" guardada por error no es un paipu.
            (cache / "260710-bbbb.pb").write_bytes(b"<?xml version=\"1.0\"?><Error/>")
            faltantes = pending_record_uuids(
                ["260710-aaaa", "260710-bbbb", "260710-cccc", "260710-cccc", ""], cache
            )
        self.assertEqual(faltantes, ["260710-bbbb", "260710-cccc"])


if __name__ == "__main__":
    unittest.main()
