"""Eliminatorias: de las salas de torneo a la hoja Playoffs, y de ahí al sitio."""
import tempfile
import unittest
from datetime import timezone
from pathlib import Path

from openpyxl import Workbook

from scripts.fill_calendar_paipus import index_roster, select_contests
from scripts.majsoul import ContestGame
from scripts.playoffs import (
    advancers, apply_playoff_writes, build_playoff_report, feeder_tables, quarter_tables,
    read_playoff_sheet, season_settled, standings, writable_playoff_rows,
)
from scripts.setup_playoffs_sheet import cells as setup_cells, kept_value, rebuild_google
from scripts.sync import (
    PLAYOFF_FORMAT_DEFAULT, build_public_data, merge_playoff_paipus, parse_playoff_history,
    playoff_format, playoff_label,
)


UTC = timezone.utc
# 2026-10-25 20:00 UTC: después del último día de la fase regular del fixture.
START = 1792958400


def player(pid, name, account_id):
    return {"id": pid, "div": pid[0], "num": pid[1:], "name": name, "shortName": name,
            "handle": name, "accountId": account_id, "discord": "", "nat": "CL"}


def rosters():
    return {
        "A": [player(f"A{n:02d}", f"A{n}", 100 + n) for n in range(1, 9)],
        "B": [player(f"B{n:02d}", f"B{n}", 200 + n) for n in range(1, 9)],
    }


def config():
    return {
        "divisions": {
            "A": {"initialPoints": 30000, "uma": [15, 5, -5, -15]},
            "B": {"initialPoints": 30000, "uma": [35, 5, -10, -30]},
        },
        "playoffs": PLAYOFF_FORMAT_DEFAULT, "playoffSheet": "Playoffs",
        "sessionsTotal": 7, "minimumAdvancedStatsHands": 8, "seasonLabel": "T",
    }


def public_data(sessions_played=7):
    """La tabla publicada: A1…A8 y B1…B8 en orden, temporada cerrada."""
    sessions = [{"status": "played" if n < sessions_played else "pending"} for n in range(7)]
    return {
        "league": {"sessionsTotal": 7},
        "divisions": {division: {"players": [{"name": p["name"]} for p in players], "sessions": sessions}
                      for division, players in rosters().items()},
    }


def sheet(values=None):
    """Las 15 filas de partidas de la hoja Playoffs, desde la fila 16."""
    values = values or {}
    rows = {}
    fmt = playoff_format(config())
    row = 16
    for round_item in fmt["rounds"]:
        for table in range(1, round_item["tables"] + 1):
            for game in range(1, round_item["hanchan"] + 1):
                label = playoff_label(round_item["id"], table, game)
                rows[label] = {"row": row, "result": "", "date": None, "time": None,
                               "paipu": "", "uuid": None, **values.get(label, {})}
                row += 1
    return rows


ACCOUNTS = {f"A{n}": 100 + n for n in range(1, 9)} | {f"B{n}": 200 + n for n in range(1, 9)}


def game(uuid, start, seats):
    """Partida de la sala: `seats` son (nombre, puntaje) por asiento."""
    return ContestGame(
        uuid=uuid, contestId="900", division="Eliminatorias A", startTime=start, endTime=start + 3600,
        seats=[{"seat": seat, "accountId": ACCOUNTS.get(name, 999), "nickname": name, "scoreRaw": score}
               for seat, (name, score) in enumerate(seats)],
    )


def report(games, sheet_rows=None, data=None, excluded=frozenset({"261008-regular"})):
    index = index_roster([p for players in rosters().values() for p in players])
    return build_playoff_report(config(), data or public_data(), sheet_rows if sheet_rows is not None else sheet(),
                                games, index, set(excluded), UTC)


def rows_by_label(result):
    return {row["label"]: row for row in result["rows"]}


# Cuartos completos: en cada mesa ganan los dos primeros sembrados de la mesa.
QUARTERS = {
    1: ["A1", "A2", "B7", "B8"], 2: ["A3", "A4", "B5", "B6"],
    3: ["B1", "B2", "A7", "A8"], 4: ["B3", "B4", "A5", "A6"],
}


def quarter_games():
    games = []
    for table, names in QUARTERS.items():
        for hanchan in (1, 2):
            scores = [40000, 32000, 26000, 22000]
            games.append(game(f"261025-qf{table}{hanchan}", START + table * 10000 + hanchan * 4000,
                              list(zip(names, scores))))
    return games


class SeedingTests(unittest.TestCase):
    def test_la_siembra_de_cuartos_es_cruzada_y_en_espejo(self):
        # La misma regla que CLAUDE.md y `playoffSeeding` en el JSX.
        tables = quarter_tables(standings(public_data()), playoff_format(config()))
        self.assertEqual(tables, [QUARTERS[1], QUARTERS[2], QUARTERS[3], QUARTERS[4]])

    def test_sin_temporada_cerrada_no_hay_cuadro(self):
        self.assertFalse(season_settled(public_data(sessions_played=6)))
        self.assertEqual(report(quarter_games(), data=public_data(sessions_played=6))["rows"], [])

    def test_las_semis_salen_de_mesas_consecutivas(self):
        self.assertEqual(feeder_tables(4, 2), [[0, 1], [2, 3]])
        self.assertEqual(feeder_tables(2, 1), [[0, 1]])
        self.assertIsNone(feeder_tables(3, 2))

    def test_pasan_los_dos_primeros_por_suma_de_puntos(self):
        hanchan = [{"name": "A1", "delta": 25.0}, {"name": "A2", "delta": 7.0},
                   {"name": "B7", "delta": -9.0}, {"name": "B8", "delta": -23.0}]
        vuelta = [{"name": "B8", "delta": 30.0}, {"name": "A2", "delta": 7.0},
                  {"name": "B7", "delta": -12.0}, {"name": "A1", "delta": -25.0}]
        self.assertEqual(advancers([hanchan, vuelta], 2), (["A2", "B8"], None))

    def test_un_empate_en_el_corte_no_lo_decide_el_script(self):
        hanchan = [{"name": "A1", "delta": 20.0}, {"name": "A2", "delta": 0.0},
                   {"name": "B7", "delta": 0.0}, {"name": "B8", "delta": -20.0}]
        winners, reason = advancers([hanchan], 2)
        self.assertIsNone(winners)
        self.assertIn("empate", reason)


class MatchingTests(unittest.TestCase):
    def test_la_partida_de_la_sala_se_propone_en_su_fila(self):
        result = report([game("261025-aaaa", START, [("B7", 26000), ("A1", 40000), ("B8", 22000), ("A2", 32000)])])
        row = rows_by_label(result)["QF M1 G1"]
        self.assertEqual(row["status"], "PROPUESTO")
        self.assertEqual(row["value"], "A1,40000,A2,32000,B7,26000,B8,22000")
        self.assertEqual(row["writes"], {
            "'Playoffs'!B16": "A1,40000,A2,32000,B7,26000,B8,22000",
            "'Playoffs'!F16": "https://mahjongsoul.game.yo-star.com/?paipu=261025-aaaa",
            "'Playoffs'!C16": "2026-10-25",
            "'Playoffs'!D16": "20:00",
        })
        self.assertEqual(rows_by_label(result)["QF M1 G2"]["status"], "PENDIENTE")

    def test_la_mesa_con_reglas_b_calcula_con_el_uma_de_b(self):
        result = report([game("261025-bbbb", START, [("B1", 40000), ("B2", 32000), ("A7", 26000), ("A8", 22000)])])
        row = rows_by_label(result)["QF M3 G1"]
        self.assertEqual(row["rules"], "B")
        self.assertEqual(row["results"][0]["delta"], 45.0)

    def test_dos_hanchan_de_la_misma_mesa_van_en_orden_de_inicio(self):
        tarde = game("261025-tarde", START + 5000, [("A1", 22000), ("A2", 26000), ("B7", 32000), ("B8", 40000)])
        temprano = game("261025-temprano", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])
        rows = rows_by_label(report([tarde, temprano]))
        self.assertEqual(rows["QF M1 G1"]["uuid"], "261025-temprano")
        self.assertEqual(rows["QF M1 G2"]["uuid"], "261025-tarde")

    def test_un_suplente_va_marcado_not(self):
        result = report([game("261025-cccc", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("Fantasma", 22000)])])
        self.assertEqual(rows_by_label(result)["QF M1 G1"]["value"], "A1,40000,A2,32000,B7,26000,NOTFantasma,22000")

    def test_una_partida_del_calendario_no_entra_al_cuadro(self):
        regular = game("261008-regular", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])
        self.assertEqual(rows_by_label(report([regular]))["QF M1 G1"]["status"], "PENDIENTE")

    def test_una_celda_escrita_distinta_es_conflicto_y_no_se_toca(self):
        otra = {"QF M1 G1": {"result": "A2,40000,A1,32000,B7,26000,B8,22000"}}
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])],
                        sheet(otra))
        row = rows_by_label(result)["QF M1 G1"]
        self.assertEqual(row["status"], "CONFLICTO")
        self.assertEqual(writable_playoff_rows(result), [])

    def test_la_misma_celda_escrita_a_mano_solo_completa_lo_que_falta(self):
        igual = {"QF M1 G1": {"result": "A1,40000,A2,32000,B7,26000,B8,22000", "date": "2026-10-25"}}
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])],
                        sheet(igual))
        row = rows_by_label(result)["QF M1 G1"]
        self.assertEqual(row["status"], "PROPUESTO")
        self.assertEqual(set(row["writes"]), {"'Playoffs'!F16", "'Playoffs'!D16"})

    def test_otro_paipu_en_la_celda_es_conflicto(self):
        otro = {"QF M1 G1": {"paipu": "https://x/?paipu=261020-zzzz", "uuid": "261020-zzzz"}}
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])],
                        sheet(otro))
        self.assertEqual(rows_by_label(result)["QF M1 G1"]["status"], "CONFLICTO")

    def test_cerrados_los_cuartos_la_semifinal_se_reconoce_sola(self):
        # SF1 = los dos primeros de QF M1 (A1, A2) y de QF M2 (A3, A4).
        semi = game("261101-sf11", START + 200000, [("A3", 40000), ("A1", 32000), ("A4", 26000), ("A2", 22000)])
        rows = rows_by_label(report(quarter_games() + [semi]))
        self.assertEqual(rows["SF M1 G1"]["status"], "PROPUESTO")
        self.assertEqual(rows["SF M1 G1"]["expected"], ["A1", "A2", "A3", "A4"])
        self.assertEqual(rows["SF M2 G1"]["expected"], ["B1", "B2", "B3", "B4"])
        self.assertEqual(rows["FINAL G1"]["detail"], "La mesa todavía no se conoce: falta cerrar la ronda anterior")

    def test_un_resultado_anotado_a_mano_sirve_para_armar_la_ronda_siguiente(self):
        # QF M2 no tiene partida en la sala, pero alguien la anotó en la hoja.
        games = [item for item in quarter_games() if not item.uuid.startswith("261025-qf2")]
        manual = {f"QF M2 G{n}": {"result": "A3,40000,A4,32000,B5,26000,B6,22000"} for n in (1, 2)}
        rows = rows_by_label(report(games, sheet(manual)))
        self.assertEqual(rows["QF M2 G1"]["status"], "OK")
        self.assertEqual(rows["SF M1 G1"]["expected"], ["A1", "A2", "A3", "A4"])

    def test_la_hoja_vieja_sin_filas_de_cuartos_se_avisa(self):
        vieja = {label: row for label, row in sheet().items() if not label.startswith("QF")}
        result = report([], vieja)
        self.assertIn("HOJA_DESACTUALIZADA", [issue["type"] for issue in result["issues"]])

    def test_una_partida_sin_mesa_despues_de_la_liga_se_avisa(self):
        extra = game("261026-xxxx", START, [("A1", 40000), ("B1", 32000), ("A5", 26000), ("B5", 22000)])
        result = report([extra])
        self.assertIn("SIN_MESA", [issue["type"] for issue in result["issues"]])


class FakeSheets:
    def __init__(self, current=None):
        self.current = dict(current or {})
        self.calls = []
        self.account_email = "bot@liga.iam.gserviceaccount.com"

    def read_cells(self, ranges):
        return {cell: self.current.get(cell, "") for cell in ranges}

    def write_cells(self, updates, value_input_option="RAW"):
        self.calls.append((value_input_option, dict(updates)))
        return len(updates)


class WriteTests(unittest.TestCase):
    def test_fecha_y_hora_se_escriben_como_las_tipearia_una_persona(self):
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])])
        client = FakeSheets()
        summary = apply_playoff_writes(client, writable_playoff_rows(result))
        modes = {mode: set(cells) for mode, cells in client.calls}
        self.assertEqual(modes["RAW"], {"'Playoffs'!B16", "'Playoffs'!F16"})
        self.assertEqual(modes["USER_ENTERED"], {"'Playoffs'!C16", "'Playoffs'!D16"})
        self.assertEqual(summary["written"], 4)

    def test_una_celda_que_alguien_lleno_en_el_medio_no_se_pisa(self):
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])])
        client = FakeSheets({"'Playoffs'!B16": "algo"})
        summary = apply_playoff_writes(client, writable_playoff_rows(result))
        self.assertNotIn("'Playoffs'!B16", {cell for _mode, cells in client.calls for cell in cells})
        self.assertEqual(summary["skipped"], 1)


class ContestSelectionTests(unittest.TestCase):
    def test_con_el_calendario_completo_no_se_pide_la_sala_regular(self):
        contests, regular, playoff = select_contests({"A": "1", "B": "2"}, {"A": "1", "B": "2"},
                                                     regular_pending=False, playoffs_active=True)
        self.assertEqual(contests, {"Eliminatorias A": "1", "Eliminatorias B": "2"})
        self.assertEqual((regular, playoff), (set(), {"1", "2"}))

    def test_una_sala_que_sirve_a_las_dos_fases_se_lee_una_vez(self):
        contests, regular, playoff = select_contests({"A": "1", "B": "2"}, {"A": "1", "B": "3"},
                                                     regular_pending=True, playoffs_active=True)
        self.assertEqual(contests, {"A": "1", "B": "2", "Eliminatorias B": "3"})
        self.assertEqual((regular, playoff), ({"1", "2"}, {"1", "3"}))

    def test_sin_nada_pendiente_no_hay_salas_que_leer(self):
        self.assertEqual(select_contests({"A": "1"}, {"A": "1"}, False, False)[0], {})


def synthetic_paipu(accounts):
    """Un registro mínimo con identidad y liquidación, como el de test_sync."""
    from ms import protocol_pb2 as pb
    record_game = pb.RecordGame()
    for seat, (account_id, nickname, point) in enumerate(accounts):
        account = record_game.accounts.add()
        account.account_id = account_id
        account.seat = seat
        account.nickname = nickname
        result = record_game.result.players.add()
        result.seat = seat
        result.part_point_1 = point
        result.total_point = point - 30000
    inner = pb.Wrapper()
    inner.name = "RecordGame"
    inner.data = record_game.SerializeToString()
    details = pb.GameDetailRecords()
    details.records.append(inner.SerializeToString())
    outer = pb.Wrapper()
    outer.name = "GameDetailRecords"
    outer.data = details.SerializeToString()
    return outer.SerializeToString()


class PublishTests(unittest.TestCase):
    def workbook(self, result, paipu):
        workbook = Workbook()
        ws = workbook.active
        ws.title = "Playoffs"
        ws["A16"], ws["B16"], ws["F16"] = "QF M1 G1", result, paipu
        return workbook

    def test_una_formula_en_paipu_no_bota_la_publicacion(self):
        # Lo que pasó en producción: la migración dejó en F24 una fórmula de
        # la hoja vieja y sync.py abortó todo con «no contiene un UUID».
        wb = self.workbook("=IFERROR(SPLIT(B16,\",\"),\"\")", "=IFERROR(INDEX(SPLIT(B16,\",\"),4),\"\")")
        history = parse_playoff_history(wb, config())
        self.assertNotIn("uuid", history[0])
        self.assertEqual(history[0]["url"], "")
        self.assertEqual(history[0]["results"], [])

    def test_el_job_reporta_las_celdas_que_no_son_dato_y_no_las_pisa(self):
        wb = self.workbook("", "=INDEX(SPLIT(B16,\",\"),4)")
        wb["Playoffs"]["C16"] = "=INDEX(SPLIT(B16,\",\"),1)"
        rows = read_playoff_sheet(wb, "Playoffs")
        self.assertEqual(rows["QF M1 G1"]["invalid"], ["C16", "F16"])
        result = report([game("261025-aaaa", START, [("A1", 40000), ("A2", 32000), ("B7", 26000), ("B8", 22000)])],
                        {**sheet(), "QF M1 G1": rows["QF M1 G1"]})
        self.assertIn("CELDA_INVALIDA", [issue["type"] for issue in result["issues"]])
        writes = rows_by_label(result)["QF M1 G1"]["writes"]
        self.assertNotIn("'Playoffs'!C16", writes)
        self.assertNotIn("'Playoffs'!F16", writes)

    def test_la_migracion_no_conserva_formulas_ni_un_paipu_falso(self):
        self.assertEqual(kept_value("F", "=INDEX(SPLIT(B24,\",\"),4)"), "")
        self.assertEqual(kept_value("F", "Puntaje"), "")
        self.assertEqual(kept_value("F", 22000), "")
        self.assertEqual(kept_value("C", "=INDEX(SPLIT(B24,\",\"),1)"), "")
        link = "https://mahjongsoul.game.yo-star.com/?paipu=261102-59faf8c1-5061-4218-9c3a-e8e806b61e94"
        self.assertEqual(kept_value("F", link), link)
        self.assertEqual(kept_value("C", 46327), 46327)
        valores = setup_cells({"SF M1 G1": {"B": "", "C": "=X", "D": "=Y", "F": "=Z"},
                               "QF M2 G1": {"B": "MasterFofo,44100,24Kakoo,43100,KaijuHead,16700,PrivateIdaho,16100",
                                            "C": 46327, "D": 0.934, "F": link}})
        self.assertEqual([valores[f"{c}24"] for c in "BCDF"], ["", "", "", ""])
        self.assertEqual(valores["F18"], link)
        self.assertEqual(valores["C18"], 46327)

    def test_una_fila_combinada_no_se_escribe_a_ciegas(self):
        # La hoja real: la fila 22 (QF M4 G1) quedó como franja combinada de
        # la hoja vieja; el job «escribió» ahí y Google descartó los valores.
        wb = Workbook()
        ws = wb.active
        ws.title = "Playoffs"
        ws["A22"] = "QF M4 G1"
        ws.merge_cells("A22:F22")
        rows = read_playoff_sheet(wb, "Playoffs")
        self.assertEqual(rows["QF M4 G1"]["invalid"], ["B22", "C22", "D22", "F22"])
        partida = game("261029-m4g1", START, [("B3", 48900), ("B4", 41600), ("A5", 33400), ("A6", -3900)])
        result = report([partida], {**sheet(), "QF M4 G1": rows["QF M4 G1"]})
        row = rows_by_label(result)["QF M4 G1"]
        self.assertEqual(row["status"], "REVISAR")
        self.assertEqual(row["writes"], {})
        self.assertNotIn(row, writable_playoff_rows(result))

    def test_la_hoja_lee_la_columna_paipu(self):
        history = parse_playoff_history(
            self.workbook("", "https://mahjongsoul.game.yo-star.com/?paipu=261025-0d302d99-6b53-44eb-b444-c56301f7258e"),
            config())
        self.assertEqual(history[0]["uuid"], "261025-0d302d99-6b53-44eb-b444-c56301f7258e")
        self.assertEqual(history[0]["paipuCell"], "Playoffs!F16")

    def test_la_partida_con_paipu_se_publica_verificada_y_con_replay(self):
        uuid = "261025-0d302d99-6b53-44eb-b444-c56301f7258e"
        history = parse_playoff_history(
            self.workbook("A1,40000,A2,32000,B7,26000,B8,22000", f"https://mahjongsoul.game.yo-star.com/?paipu={uuid}"),
            config())
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            # Asientos en otro orden que el puesto: el resultado sale de la liquidación.
            (cache / f"{uuid}.pb").write_bytes(synthetic_paipu(
                [(207, "B7", 26000), (101, "A1", 40000), (208, "B8", 22000), (102, "A2", 32000)]))
            status = merge_playoff_paipus(history, rosters(), config(), cache, offline=True)
        self.assertEqual(status[0]["status"], "PUBLICADO")
        data, _ = build_public_data(config(), rosters(), [], [], {}, {}, history)
        match = data["playoffMatches"][0]
        self.assertTrue(match["verified"])
        self.assertEqual(match["source"], "paipu")
        self.assertEqual(match["paipuUrl"], f"https://mahjongsoul.game.yo-star.com/?paipu={uuid}")
        self.assertEqual([p["name"] for p in match["players"]], ["A1", "A2", "B7", "B8"])
        self.assertEqual([p["id"] for p in match["players"]], ["A01", "A02", "B07", "B08"])
        self.assertEqual(match["players"][0]["delta"], 25.0)
        # La fecha sale del UUID cuando la hoja no la tiene.
        self.assertEqual(match["dateISO"], "2026-10-25")

    def test_un_paipu_que_no_suma_120000_no_se_publica(self):
        uuid = "261025-0d302d99-6b53-44eb-b444-c56301f7258e"
        history = parse_playoff_history(self.workbook("", f"https://x/?paipu={uuid}"), config())
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            (cache / f"{uuid}.pb").write_bytes(synthetic_paipu(
                [(101, "A1", 39000), (102, "A2", 32000), (207, "B7", 26000), (208, "B8", 22000)]))
            status = merge_playoff_paipus(history, rosters(), config(), cache, offline=True)
        self.assertEqual(status[0]["status"], "ERROR")
        self.assertNotIn("paipu", history[0])



if __name__ == "__main__":
    unittest.main()


class FakeGoogle:
    """La hoja real tal como quedó: franjas combinadas y fórmulas viejas."""

    def __init__(self, current):
        self.current = current
        self.requests = []
        self.written = {}
        self.account_email = "bot@liga.iam.gserviceaccount.com"

    def read_cells(self, ranges):
        return {cell: self.current.get(cell, "") for cell in ranges}

    def sheet_layout(self, title):
        merge = {"sheetId": 7, "startRowIndex": 21, "endRowIndex": 22, "startColumnIndex": 0, "endColumnIndex": 6}
        return {"sheetId": 7, "merges": [merge]}

    def batch_update(self, requests):
        self.requests.extend(requests)

    def write_cells(self, updates, value_input_option="RAW"):
        self.written.update(updates)
        return len(updates)


class RebuildGoogleTests(unittest.TestCase):
    def test_rehacer_la_hoja_descombina_limpia_y_conserva_solo_datos(self):
        link = "https://mahjongsoul.game.yo-star.com/?paipu=261102-59faf8c1-5061-4218-9c3a-e8e806b61e94"
        client = FakeGoogle({
            "'Playoffs'!A21": "QF M3 G2", "'Playoffs'!B21": "Chubi!,49600,cidoku,39700,Sircrab,22200,SentryPeru,8500",
            "'Playoffs'!C21": "46327", "'Playoffs'!D21": "0.8930555556", "'Playoffs'!F21": link,
            "'Playoffs'!A22": "QF M4 G1",
            "'Playoffs'!A24": "SF M1 G1", "'Playoffs'!C24": "=IF($B15=\"\",\"\",1)", "'Playoffs'!F24": "=IF($B15=\"\",\"\",2)",
        })
        rebuild_google(client)
        kinds = [next(iter(request)) for request in client.requests]
        self.assertEqual(kinds[0], "unmergeCells")
        clear = client.requests[1]["updateCells"]
        self.assertEqual((clear["range"]["endRowIndex"], clear["range"]["endColumnIndex"]), (100, 26))
        self.assertEqual(clear["fields"], "userEnteredValue,userEnteredFormat")
        # Lo escrito por el job se conserva; las fórmulas viejas no vuelven.
        self.assertEqual(client.written["'Playoffs'!B21"], "Chubi!,49600,cidoku,39700,Sircrab,22200,SentryPeru,8500")
        self.assertEqual(client.written["'Playoffs'!F21"], link)
        self.assertEqual(client.written["'Playoffs'!C21"], "46327")
        self.assertNotIn("'Playoffs'!C24", client.written)
        self.assertNotIn("'Playoffs'!F24", client.written)
        self.assertEqual(client.written["'Playoffs'!A22"], "QF M4 G1")
        self.assertEqual(client.written["'Playoffs'!F15"], "Paipu")
