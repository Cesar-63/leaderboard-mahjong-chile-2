"""Partidas de eliminatorias: de las salas de torneo a la hoja Playoffs.

Las eliminatorias se juegan en las mismas salas de Mahjong Soul que la fase
regular, cada mesa en la sala de su regla, pero no están en el Calendario: el
cuadro no se sortea, sale de la tabla. Este módulo hace para la hoja Playoffs
lo que `fill_calendar_paipus.py` + `fill_game_history.py` hacen para la fase
regular:

1. Arma las mesas esperadas. Los cuartos salen de la tabla final publicada
   (`data/liga.json`), con la misma siembra cruzada en espejo que
   `playoffSeeding` en `components-playoffs.jsx`. Cada ronda siguiente sale
   de los dos primeros de cada mesa de la anterior, sumando sus hanchan con
   el uma de la regla de esa mesa.
2. Empareja cada partida de la sala con la mesa que comparta al menos 3 de
   sus 4 jugadores (3 y no 4, para tolerar un suplente). Una partida de la
   fase regular nunca llega a 3 contra una mesa de cuartos, porque cada mesa
   tiene dos de A y dos de B; igual se descartan todas las del Calendario.
3. Propone, por hanchan, el resultado (columna B, formato Game History),
   fecha y hora (C y D) y el enlace al paipu (F). Nunca pisa una celda
   escrita: si dice otra cosa, es CONFLICTO y lo resuelve una persona.

La lógica es pura y está separada de la escritura (`apply_playoff_writes`),
como en los otros dos scripts.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from openpyxl.utils import get_column_letter

from scripts.gsheets import quote_sheet
from scripts.majsoul import ContestGame, PaipuError, extract_uuid
from scripts.sync import (
    DIVISIONS, PLAYOFF_DATE_COL, PLAYOFF_LABEL_COL, PLAYOFF_LABEL_RE, PLAYOFF_PAIPU_COL,
    PLAYOFF_RESULT_COL, PLAYOFF_TIME_COL, SyncError, TOTAL_RAW_SCORE, cell_value,
    format_history_line, parse_history_line, playoff_format, playoff_label,
)

MIN_PLAYER_OVERLAP = 3
PAIPU_URL = "https://mahjongsoul.game.yo-star.com/?paipu={uuid}"
# Orden de severidad para el reporte, igual que en los otros dos scripts.
STATUS_ORDER = ["PROPUESTO", "REVISAR", "CONFLICTO", "PENDIENTE", "OK"]


# ------------------------------------------------------------------ cuadro


def season_settled(data: dict[str, Any]) -> bool:
    """Si la fase regular terminó en las dos divisiones.

    Es la misma condición que `playoffSeasonProgress` en la vista: mientras
    quede una sesión por jugar, los clasificados son proyección, no cuadro."""
    total = int((data.get("league") or {}).get("sessionsTotal") or 0)
    if total <= 0:
        return False
    for division in DIVISIONS:
        sessions = ((data.get("divisions") or {}).get(division) or {}).get("sessions") or []
        if sum(1 for session in sessions if session.get("status") == "played") < total:
            return False
    return True


def standings(data: dict[str, Any]) -> dict[str, list[str]]:
    """Nombres de cada división en el orden de la tabla publicada."""
    return {division: [player["name"] for player in data["divisions"][division]["players"]]
            for division in DIVISIONS}


def quarter_tables(table: dict[str, list[str]], fmt: dict[str, Any]) -> list[list[str]] | None:
    """Las mesas de la primera ronda, con la siembra cruzada en espejo.

    Gemela de `playoffSeeding` en `components-playoffs.jsx`: la división
    dueña de las reglas de la mesa pone a sus mejores sembrados y la otra a sus
    últimos clasificados. Con ocho por división y reglas A, A, B, B:
    M1 = A1 A2 B7 B8, M2 = A3 A4 B5 B6, M3 = B1 B2 A7 A8, M4 = B3 B4 A5 A6.
    Un formato que no llena mesas de cuatro devuelve None, como la vista."""
    first = fmt["rounds"][0]
    per_division = int(fmt["qualifiersPerDivision"])
    rules = first["rulesByTable"]
    if first["tables"] * 2 != per_division or len(rules) != first["tables"]:
        return None
    for division in DIVISIONS:
        if rules.count(division) * len(DIVISIONS) != first["tables"]:
            return None
        if len(table[division]) < per_division:
            return None
    hosted = {division: 0 for division in DIVISIONS}
    tables = []
    for host in rules:
        guest = next(division for division in DIVISIONS if division != host)
        index = hosted[host]
        hosted[host] += 1
        top = index * 2
        bottom = per_division - (index + 1) * 2
        tables.append([table[host][top], table[host][top + 1], table[guest][bottom], table[guest][bottom + 1]])
    return tables


def advancers(hanchans: list[list[dict[str, Any]]], advance: int) -> tuple[list[str] | None, str | None]:
    """Los que pasan de una mesa: los `advance` primeros por suma de puntos.

    `hanchans` son los resultados de cada hanchan de la mesa (con `delta`).
    Un empate justo en el corte no lo decide el script —el reglamento manda—,
    así que devuelve None con el motivo, y la ronda siguiente queda pendiente.
    Un suplente no puede pasar en lugar de un titular: lo mismo."""
    totals: dict[str, float] = defaultdict(float)
    names: dict[str, str] = {}
    substitutes: set[str] = set()
    for results in hanchans:
        for item in results:
            key = str(item["name"]).strip().lower()
            totals[key] = round(totals[key] + float(item["delta"]), 1)
            names[key] = str(item["name"]).strip()
            if item.get("suplente"):
                substitutes.add(key)
    ranked = sorted(totals, key=lambda key: totals[key], reverse=True)
    if len(ranked) < advance:
        return None, "la mesa no tiene suficientes jugadores"
    if len(ranked) > advance and totals[ranked[advance - 1]] == totals[ranked[advance]]:
        return None, (
            f"empate en el corte entre {names[ranked[advance - 1]]} y {names[ranked[advance]]} "
            f"({totals[ranked[advance]]:+.1f}); lo decide el reglamento"
        )
    chosen = ranked[:advance]
    if any(key in substitutes for key in chosen):
        return None, "un suplente quedó entre los clasificados; lo decide el reglamento"
    return [names[key] for key in chosen], None


def feeder_tables(previous_tables: int, tables: int) -> list[list[int]] | None:
    """Qué mesas de la ronda anterior alimentan cada mesa (0-indexadas).

    Gemela de `playoffFeederSeats`: las mesas se reparten en orden, así que
    las dos primeras de cuartos alimentan la semifinal 1 y el árbol no se
    cruza."""
    if tables <= 0 or previous_tables % tables:
        return None
    ratio = previous_tables // tables
    return [[table * ratio + offset for offset in range(ratio)] for table in range(tables)]


# ---------------------------------------------------------------- planilla


def read_playoff_sheet(workbook: Any, sheet_name: str) -> dict[str, dict[str, Any]] | None:
    """Fila y contenido de cada rótulo de la hoja, o None si la hoja no existe."""
    if sheet_name not in workbook.sheetnames:
        return None
    ws = workbook[sheet_name]
    rows: dict[str, dict[str, Any]] = {}
    for row in range(1, ws.max_row + 1):
        label = str(cell_value(ws.cell(row, PLAYOFF_LABEL_COL)) or "").strip().upper()
        if not PLAYOFF_LABEL_RE.match(label):
            continue
        label = " ".join(label.split())
        paipu = str(cell_value(ws.cell(row, PLAYOFF_PAIPU_COL)) or "").strip()
        try:
            uuid = extract_uuid(paipu) if paipu else None
        except PaipuError:
            uuid = None
        rows[label] = {
            "row": row,
            "result": str(cell_value(ws.cell(row, PLAYOFF_RESULT_COL)) or "").strip(),
            "date": cell_value(ws.cell(row, PLAYOFF_DATE_COL)),
            "time": cell_value(ws.cell(row, PLAYOFF_TIME_COL)),
            "paipu": paipu, "uuid": uuid,
        }
    return rows


def cell_ref(sheet_name: str, column: int, row: int) -> str:
    return f"{quote_sheet(sheet_name)}!{get_column_letter(column)}{row}"


# --------------------------------------------------------------- partidas


def resolve_game(game: ContestGame, index: dict[str, Any], expected: list[str]) -> list[dict[str, Any]]:
    """Los cuatro asientos con su nombre de liga y si son suplentes.

    Se busca por account_id en los dos rosters (las mesas mezclan A y B) y,
    si no, por apodo. Un asiento que no está en el roster, o que está pero no
    era de esta mesa, es suplente: va marcado `NOT` en la celda."""
    group = {name.strip().lower() for name in expected}
    seats = []
    for seat in sorted(game.seats, key=lambda item: item["seat"]):
        player = index["byAccount"].get(seat.get("accountId"))
        if player is None and seat.get("nickname"):
            player = index["byName"].get(str(seat["nickname"]).strip().lower())
        name = player["name"] if player else (str(seat.get("nickname") or "").strip() or "Suplente")
        seats.append({
            "seat": seat["seat"], "name": name, "scoreRaw": seat.get("scoreRaw"),
            "suplente": player is None or name.strip().lower() not in group,
        })
    return seats


def rank_results(seats: list[dict[str, Any]], rule: dict[str, Any]) -> list[dict[str, Any]]:
    """De 1º a 4º, con el uma de la regla de la mesa: la celda del Game History.

    El orden es estable, así que dos empatados quedan por asiento (el más
    cercano al este arriba), que es como desempata Mahjong Soul."""
    ranked = sorted(seats, key=lambda seat: int(seat["scoreRaw"]), reverse=True)
    line = format_history_line([
        {"name": seat["name"], "scoreRaw": int(seat["scoreRaw"]), "suplente": seat["suplente"]}
        for seat in ranked
    ])
    return parse_history_line(line, rule, "paipu")


def score_problem(seats: list[dict[str, Any]]) -> str | None:
    scores = [seat.get("scoreRaw") for seat in seats]
    if len(scores) != 4 or any(score is None for score in scores):
        return "la sala no informó los cuatro puntajes"
    if any(int(score) % 100 for score in scores):
        return "hay puntajes que no son múltiplos de 100"
    if sum(int(score) for score in scores) != TOTAL_RAW_SCORE:
        return f"los puntajes suman {sum(int(s) for s in scores):,} y no 120.000".replace(",", ".")
    return None


def same_line(left: list[dict[str, Any]], right: list[dict[str, Any]]) -> bool:
    """Mismo resultado salvo mayúsculas y la marca de suplente."""
    def shape(results: list[dict[str, Any]]) -> list[tuple[str, int]]:
        return [(str(item["name"]).strip().lower(), int(item["scoreRaw"])) for item in results]

    return shape(left) == shape(right)


def build_playoff_report(
    config: dict[str, Any],
    data: dict[str, Any],
    sheet: dict[str, dict[str, Any]] | None,
    games: list[ContestGame],
    index: dict[str, Any],
    excluded_uuids: set[str],
    tz: Any,
) -> dict[str, Any]:
    """Una fila por hanchan de eliminatorias: qué celdas tocar y con qué.

    `games` son las partidas de las salas de eliminatorias; `excluded_uuids`,
    las que ya son de la fase regular (están en el Calendario)."""
    sheet_name = str(config.get("playoffSheet") or "Playoffs")
    fmt = playoff_format(config)
    rows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    if sheet is None:
        issues.append({"type": "SIN_HOJA", "message": f"La planilla no tiene la hoja «{sheet_name}»."})
        return {"rows": rows, "issues": issues, "gamesMatched": 0}
    if not season_settled(data):
        return {"rows": rows, "issues": issues, "gamesMatched": 0}
    missing = [playoff_label(round_item["id"], table, game)
               for round_item in fmt["rounds"]
               for table in range(1, round_item["tables"] + 1)
               for game in range(1, round_item["hanchan"] + 1)
               if playoff_label(round_item["id"], table, game) not in sheet]
    if missing:
        issues.append({
            "type": "HOJA_DESACTUALIZADA",
            "message": (
                f"La hoja «{sheet_name}» no tiene las filas {', '.join(missing[:6])}"
                f"{', …' if len(missing) > 6 else ''}. Corre el workflow con «Preparar hoja "
                "Playoffs» (scripts/setup_playoffs_sheet.py --write): conserva lo ya escrito."
            ),
        })

    candidates = sorted(
        (game for game in games if game.uuid.lower() not in excluded_uuids),
        key=lambda game: game.startTime,
    )
    assigned: set[str] = set()
    tables = quarter_tables(standings(data), fmt)
    for round_index, round_item in enumerate(fmt["rounds"]):
        round_id = round_item["id"]
        next_tables: list[list[str] | None] = []
        qualified: list[list[str] | None] = []
        for table_no in range(1, round_item["tables"] + 1):
            expected = tables[table_no - 1] if tables else None
            rule_division = round_item["rulesByTable"][table_no - 1]
            rule = config["divisions"][rule_division]
            matched = []
            if expected:
                matched = match_table(candidates, assigned, expected, index)
                assigned.update(item["game"].uuid for item in matched)
            extras = matched[round_item["hanchan"]:]
            if extras:
                issues.append({
                    "type": "MESA_CON_EXTRAS",
                    "message": (
                        f"{playoff_label(round_id, table_no, 1).rsplit(' G', 1)[0]} tiene "
                        f"{len(matched)} partidas en la sala y la ronda juega {round_item['hanchan']}: "
                        + ", ".join(f"{item['game'].uuid} ({stamp(item['game'].startTime, tz)})" for item in matched)
                        + ". Quedan en REVISAR; elige cuáles van."
                    ),
                })
            table_results: list[list[dict[str, Any]]] = []
            for game_no in range(1, round_item["hanchan"] + 1):
                entry = matched[game_no - 1] if len(matched) >= game_no else None
                row = build_row(sheet_name, sheet, round_id, table_no, game_no, rule_division, rule,
                                expected, entry, bool(extras), tz, issues)
                rows.append(row)
                if row.get("results"):
                    table_results.append(row["results"])
            # Con partidas de más no se sabe cuáles cuentan: hasta que una
            # persona elija, la ronda siguiente queda pendiente.
            if expected and not extras and len(table_results) == round_item["hanchan"]:
                winners, reason = advancers(table_results, round_item["advancePerTable"])
                if reason:
                    issues.append({
                        "type": "AVANCE_PENDIENTE",
                        "message": f"{playoff_label(round_id, table_no, 1).rsplit(' G', 1)[0]}: {reason}.",
                    })
                qualified.append(winners)
            else:
                qualified.append(None)
        if round_index + 1 < len(fmt["rounds"]):
            following = fmt["rounds"][round_index + 1]
            feeders = feeder_tables(round_item["tables"], following["tables"])
            for sources in feeders or []:
                seats = [qualified[source] for source in sources]
                next_tables.append(sum(seats, []) if all(seats) else None)
            tables = next_tables if feeders else None

    cutoff = max((uuid[:6] for uuid in excluded_uuids if uuid[:6].isdigit()), default="")
    for game in candidates:
        if game.uuid in assigned or game.uuid.lower()[:6] < cutoff:
            continue
        names = [seat.get("nickname") or "?" for seat in game.seats]
        issues.append({
            "type": "SIN_MESA",
            "message": (
                f"La partida {game.uuid} ({stamp(game.startTime, tz)}: {', '.join(names)}) no calza "
                f"con ninguna mesa de eliminatorias conocida. Si es de una ronda cuya mesa todavía "
                f"no se conoce, se asigna sola cuando la anterior quede completa."
            ),
        })
    return {"rows": rows, "issues": issues, "gamesMatched": len(assigned)}


def match_table(candidates: list[ContestGame], assigned: set[str], expected: list[str],
                index: dict[str, Any]) -> list[dict[str, Any]]:
    """Partidas de la sala con al menos 3 de los 4 jugadores de la mesa, por fecha."""
    expected_ids = set()
    for name in expected:
        player = index["byName"].get(name.strip().lower())
        if player:
            expected_ids.add(player["id"])
    matched = []
    for game in candidates:
        if game.uuid in assigned:
            continue
        ids = set()
        for seat in game.seats:
            player = index["byAccount"].get(seat.get("accountId"))
            if player is None and seat.get("nickname"):
                player = index["byName"].get(str(seat["nickname"]).strip().lower())
            if player:
                ids.add(player["id"])
        overlap = len(ids & expected_ids)
        if overlap >= MIN_PLAYER_OVERLAP:
            matched.append({"game": game, "overlap": overlap, "seats": resolve_game(game, index, expected)})
    return matched


def build_row(sheet_name: str, sheet: dict[str, dict[str, Any]], round_id: str, table: int,
              game_no: int, rule_division: str, rule: dict[str, Any], expected: list[str] | None,
              entry: dict[str, Any] | None, has_extras: bool, tz: Any,
              issues: list[dict[str, Any]]) -> dict[str, Any]:
    label = playoff_label(round_id, table, game_no)
    current = sheet.get(label)
    row: dict[str, Any] = {
        "label": label, "round": round_id, "table": table, "game": game_no,
        "rules": rule_division, "expected": expected, "status": "PENDIENTE", "detail": "",
        "writes": {}, "uuid": None, "start": None, "results": None, "value": None,
    }
    written = None
    if current and current["result"]:
        try:
            written = parse_history_line(current["result"], rule, f"{sheet_name}!B{current['row']}")
        except SyncError as exc:
            issues.append({"type": "CELDA_INVALIDA", "message": str(exc)})
    if entry is None:
        # Sin partida en la sala: si alguien la anotó a mano, igual sirve para
        # saber quién pasa a la ronda siguiente.
        row["results"] = written
        if written:
            row["status"], row["detail"] = "OK", "Anotado en la hoja, sin partida en la sala que lo verifique"
        elif expected:
            row["detail"] = "Sin partida en la sala para esta mesa todavía"
        else:
            row["detail"] = "La mesa todavía no se conoce: falta cerrar la ronda anterior"
        return row

    game = entry["game"]
    seats = entry["seats"]
    row["uuid"], row["start"] = game.uuid, stamp(game.startTime, tz)
    problem = score_problem(seats)
    if problem:
        issues.append({"type": "PAIPU_INVALIDO", "message": f"{label} ({game.uuid}): {problem}."})
        row["status"], row["detail"] = "REVISAR", problem
        row["results"] = written
        return row
    results = rank_results(seats, rule)
    row["results"] = results
    row["value"] = format_history_line(results)
    if current is None:
        row["detail"] = f"La hoja no tiene la fila «{label}»"
        return row
    if current["uuid"] and current["uuid"] != game.uuid.lower():
        row["status"] = "CONFLICTO"
        row["detail"] = f"La celda Paipu ya tiene {current['uuid']} y la sala entrega {game.uuid}; no se toca."
        return row
    if written and not same_line(written, results):
        row["status"] = "CONFLICTO"
        row["detail"] = (
            f"La celda dice «{current['result']}» y la partida {game.uuid} dice «{row['value']}»; no se toca."
        )
        return row
    moment = datetime.fromtimestamp(int(game.startTime), tz) if game.startTime else None
    proposed = {
        cell_ref(sheet_name, PLAYOFF_RESULT_COL, current["row"]): (row["value"], bool(current["result"])),
        cell_ref(sheet_name, PLAYOFF_PAIPU_COL, current["row"]): (PAIPU_URL.format(uuid=game.uuid), bool(current["paipu"])),
    }
    if moment:
        proposed[cell_ref(sheet_name, PLAYOFF_DATE_COL, current["row"])] = (moment.strftime("%Y-%m-%d"), current["date"] not in (None, ""))
        proposed[cell_ref(sheet_name, PLAYOFF_TIME_COL, current["row"])] = (moment.strftime("%H:%M"), current["time"] not in (None, ""))
    row["writes"] = {cell: value for cell, (value, filled) in proposed.items() if not filled}
    if not row["writes"]:
        row["status"], row["detail"] = "OK", "La hoja ya tiene esta partida"
    elif has_extras:
        row["status"], row["detail"] = "REVISAR", "La mesa tiene partidas de más en la sala"
    else:
        row["status"], row["detail"] = "PROPUESTO", "Partida de la sala; celdas vacías"
    return row


def stamp(timestamp: int, tz: Any) -> str:
    return datetime.fromtimestamp(int(timestamp), tz).strftime("%Y-%m-%d %H:%M") if timestamp else "—"


# --------------------------------------------------------------- escritura


DATE_TIME_COLUMNS = (get_column_letter(PLAYOFF_DATE_COL), get_column_letter(PLAYOFF_TIME_COL))


def writable_playoff_rows(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in report["rows"] if row["status"] == "PROPUESTO" and row["writes"]]


def apply_playoff_writes(client: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Pega las celdas propuestas, releyendo antes cada una.

    El reporte se armó sobre una copia descargada: si alguien escribió una
    celda en el medio, se respeta. Resultado y enlace van tal cual (RAW);
    fecha y hora como si las tipeara una persona, para que la planilla las
    guarde como fecha y hora y no como texto."""
    targets = [cell for row in rows for cell in row["writes"]]
    current = client.read_cells(targets) if targets else {}
    raw_updates: dict[str, str] = {}
    typed_updates: dict[str, str] = {}
    skipped = 0
    for row in rows:
        outcome = "ESCRITO"
        for cell, value in row["writes"].items():
            if current.get(cell, ""):
                skipped += 1
                outcome = "PARCIAL"
                continue
            column = cell.rsplit("!", 1)[1].rstrip("0123456789")
            (typed_updates if column in DATE_TIME_COLUMNS else raw_updates)[cell] = value
        row["writeOutcome"] = outcome
    written = 0
    if raw_updates:
        written += client.write_cells(raw_updates)
    if typed_updates:
        written += client.write_cells(typed_updates, value_input_option="USER_ENTERED")
    return {
        "mode": "aplicado", "account": client.account_email,
        "attempted": len(targets), "written": len(raw_updates) + len(typed_updates),
        "updatedCells": written, "skipped": skipped, "error": None,
    }


def planned_playoff_writes(rows: list[dict[str, Any]]) -> dict[str, Any]:
    for row in rows:
        row["writeOutcome"] = "SIMULADO"
    return {
        "mode": "simulacro", "account": None,
        "attempted": sum(len(row["writes"]) for row in rows), "written": 0,
        "updatedCells": 0, "skipped": 0, "error": None,
    }


def render_playoff_text(report: dict[str, Any]) -> list[str]:
    rows = report.get("rows") or []
    if not rows and not report.get("issues"):
        return []
    counts = {status: sum(1 for row in rows if row["status"] == status) for status in STATUS_ORDER}
    lines = ["", "Eliminatorias: " + ", ".join(f"{key}={value}" for key, value in counts.items())
             + f" (partidas de la sala emparejadas: {report.get('gamesMatched', 0)})"]
    for row in rows:
        if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO"):
            outcome = f"  → {row['writeOutcome']}" if row.get("writeOutcome") else ""
            lines.append(f"  [{row['status']}] {row['label']}  {row['start'] or '—'}{outcome}")
            lines.append(f"      {row['value'] or row['detail']}")
    write = report.get("write")
    if write and write["mode"] == "aplicado":
        lines.append(f"  Hoja Playoffs: {write['written']} celdas escritas, {write['skipped']} ya tenían algo")
    elif write and write["attempted"]:
        lines.append(f"  Hoja Playoffs: {write['attempted']} celdas listas para pegar (usa --write)")
    if write and write.get("error"):
        lines.append(f"  ERROR de escritura: {write['error']}")
    for issue in report.get("issues") or []:
        lines.append(f"  [{issue['type']}] {issue['message']}")
    return lines


def render_playoff_markdown(report: dict[str, Any]) -> list[str]:
    rows = report.get("rows") or []
    if not rows and not report.get("issues"):
        return []
    lines = ["", "### Eliminatorias", ""]
    actionable = [row for row in rows if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO")]
    if actionable:
        lines += ["| Estado | Partida | Inicio | Escritura | Resultado |", "| --- | --- | --- | --- | --- |"]
        for row in actionable:
            lines.append(f"| {row['status']} | {row['label']} | {row['start'] or '—'} | "
                         f"{row.get('writeOutcome') or '—'} | {row['value'] or row['detail']} |")
    else:
        done = sum(1 for row in rows if row["status"] == "OK")
        lines.append(f"Sin celdas nuevas: {done} de {len(rows)} hanchan ya están en la hoja.")
    for issue in report.get("issues") or []:
        lines.append(f"- **{issue['type']}**: {issue['message']}")
    return lines
