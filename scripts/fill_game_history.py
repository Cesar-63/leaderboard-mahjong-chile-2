#!/usr/bin/env python3
"""Completa Game History A/B con los puntajes que ya declaran los paipus.

El Calendario dice qué paipu corresponde a cada hanchan (lo pega
`fill_calendar_paipus.py`). Este script abre esos registros, ordena los cuatro
asientos de 1º a 4º y arma la celda tal como se escribe a mano en el Game
History:

    MasterFofo,35900,Uznaiker,31100,Mon_96,30900,Tobippi,22100

Por defecto sólo propone celda y valor. Con `--write` las pega en el Google
Sheet con la misma cuenta de servicio que usa `fill_calendar_paipus.py`, y con
`--fetch-logs` aprovecha la sesión técnica para bajar los paipus que falten.
Nunca sobrescribe una celda escrita: si el paipu dice algo distinto de lo que ya
está, es CONFLICTO y lo resuelve una persona.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl import load_workbook

from scripts.fill_calendar_paipus import GAMES_PER_TABLE, append_step_summary, build_tables
from scripts.gsheets import CREDENTIALS_ENV, SheetsClient, SheetsError, has_credentials, load_service_account, quote_sheet
from scripts.majsoul import (
    MAX_RECORDS_PER_RUN, PaipuError, RecordFetchResult, fetch_missing_records, parse_record,
    pending_record_uuids,
)
from scripts.sync import (
    MIN_ROSTER_OVERLAP, TOTAL_RAW_SCORE, SyncError, align_history_with_fixtures, download_sheet,
    format_history_line, history_rows, load_config, match_fixture_order, match_paipu_seats,
    parse_history, read_calendar, read_roster,
)


ROOT = Path(__file__).resolve().parents[1]
# Nombre para un asiento que ni el roster ni el paipu identifican. `sync.py` lo
# trata como suplente igual, porque lo que lo delata es no estar en el roster.
SUBSTITUTE_NAME = "Suplente"
# Orden de severidad para el resumen y el ordenamiento del reporte.
STATUS_ORDER = ["PROPUESTO", "REVISAR", "CONFLICTO", "PENDIENTE", "OK"]
# Lo único que el script pega solo: celda vacía y un paipu que nombra a los
# cuatro asientos. Sin esa identidad el orden de los asientos es una conjetura.
WRITE_STATUSES = ("PROPUESTO",)


# ---------------------------------------------------------------- lectura


def read_history_sheets(workbook: Any, config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Filas y contenido actual de cada hoja Game History, por división."""
    sheets: dict[str, dict[str, Any]] = {}
    for division, rule in config["divisions"].items():
        name = rule["historySheet"]
        ws = workbook[name]
        sheets[division] = {"name": name, "rows": history_rows(ws)}
    return sheets


def load_parsed(uuid: str, cache_dir: Path) -> tuple[Any, str | None]:
    """El paipu ya descargado, o el motivo por el que no se puede leer."""
    path = cache_dir / f"{uuid}.pb"
    if not path.exists():
        return None, "El paipu no está en la caché local; corre con --fetch-logs"
    raw = path.read_bytes()
    if raw.lstrip().startswith(b"<?xml"):
        return None, "El .pb en caché es la respuesta de 'requiere sesión técnica', no un registro"
    try:
        return parse_record(uuid, raw), None
    except PaipuError as exc:
        return None, str(exc)
    except Exception as exc:  # pragma: no cover - depende del registro
        return None, f"{type(exc).__name__}: {exc}"


# ---------------------------------------------------------- mesa y asientos


def slots_in_use(histories: dict[str, dict[str, Any]]) -> dict[tuple[str, int], set[int]]:
    """Mesas del Game History con algo escrito, por división y sesión."""
    used: dict[tuple[str, int], set[int]] = defaultdict(set)
    for key, entry in histories.items():
        used[(key.split("-", 1)[0], entry["session"])].add(entry["table"])
    return used


def slots_by_table(aligned: dict[str, dict[str, Any]], fixtures: list[dict[str, Any]]) -> dict[tuple[str, int, int], int]:
    """Mesa del Game History que ya ocupa cada mesa del Calendario.

    El emparejamiento lo hace `align_history_with_fixtures`, el mismo que usa
    `sync.py`, para que las dos numeraciones no se interpreten distinto. De su
    resultado se conserva sólo lo que coincidió de verdad: su caso de respaldo
    (ningún grupo del calendario coincide) devuelve el número original, y eso no
    reclama ninguna mesa.
    """
    rosters = {
        (f["division"], f["session"], f["table"]): {str(n).strip().lower() for n in f["players"] if n}
        for f in fixtures
    }
    slots: dict[tuple[str, int, int], int] = {}
    for key, entry in aligned.items():
        division = key.split("-", 1)[0]
        cell = (division, entry["session"], entry["table"])
        names = {str(item["name"]).strip().lower() for item in entry["results"]}
        if len(names & rosters.get(cell, set())) >= MIN_ROSTER_OVERLAP:
            slots[cell] = entry["tableGameHistory"]
    return slots


def usable_slots(rows: dict[tuple[int, int, int], int], session: int) -> set[int]:
    """Mesas de esa sesión que tienen fila rotulada para los dos hanchan."""
    mesas = {mesa for sesion, mesa, _game in rows if sesion == session}
    return {mesa for mesa in mesas if all((session, mesa, game) in rows for game in range(1, GAMES_PER_TABLE + 1))}


def pick_slot(available: set[int], taken: set[int], preferred: int) -> int | None:
    """Mesa libre del Game History para una mesa que todavía no tiene ninguna.

    Se prefiere el mismo número que el Calendario, para que las dos
    numeraciones converjan; si está ocupado, la primera libre. `sync.py`
    reempareja por jugadores de todos modos, así que el número es una etiqueta.
    """
    if preferred in available and preferred not in taken:
        return preferred
    return next((slot for slot in sorted(available) if slot not in taken), None)


def resolve_seat_names(parsed: Any, fixture_players: list[str], roster: list[dict[str, Any]]) -> tuple[list[str] | None, str, str]:
    """Nombre por asiento para la celda, más de dónde salió esa identidad.

    Devuelve `(nombres, identidad, motivo)`. `identidad` es `paipu` cuando el
    registro nombra a los asientos —único caso que el script pega solo— y
    `revisar` cuando hubo que confiar en el orden del Calendario o algún asiento
    quedó sin nombre: emparejar mal un puntaje con un jugador es peor que dejar
    la celda vacía.
    """
    seat_map = match_paipu_seats(parsed.players, roster) if len(parsed.players) == 4 else None
    identity, reason = "paipu", "El paipu nombra a los asientos"
    if seat_map is None:
        seat_map = match_fixture_order(fixture_players, roster)
        identity, reason = "revisar", "El paipu no nombra a los asientos; el orden sale del Calendario"
    if seat_map is None:
        return None, "revisar", "Ni el paipu ni el Calendario identifican a los cuatro asientos"
    names: list[str] = []
    for seat in range(4):
        player = seat_map.get(seat)
        if player is not None:
            names.append(str(player["name"]))
            continue
        nickname = str((parsed.players[seat] or {}).get("nickname") or "").strip()
        names.append(nickname or SUBSTITUTE_NAME)
        if not nickname:
            identity = "revisar"
            reason = f"El asiento {seat + 1} no está en el roster y el paipu no lo nombra"
    return names, identity, reason


def score_problems(scores: list[int]) -> list[str]:
    """Lo que descalifica a un paipu como fuente de la celda."""
    problems: list[str] = []
    if len(scores) != 4:
        return [f"el paipu entrega {len(scores)} puntajes y no 4"]
    total = sum(scores)
    if total != TOTAL_RAW_SCORE:
        problems.append(f"los puntajes suman {total:,} y no {TOTAL_RAW_SCORE:,}".replace(",", "."))
    sueltos = [score for score in scores if score % 100]
    if sueltos:
        problems.append("hay puntajes que no son múltiplo de 100: " + ", ".join(str(s) for s in sueltos))
    return problems


def rank_seats(names: list[str], scores: list[int]) -> list[dict[str, Any]]:
    """Los cuatro asientos ordenados de 1º a 4º, como los lista el Game History.

    El orden es estable: entre dos empatados queda arriba el asiento más
    cercano al este, que es como desempata Mahjong Soul.
    """
    ranked = sorted(zip(names, scores), key=lambda pair: pair[1], reverse=True)
    return [{"name": name, "scoreRaw": int(score)} for name, score in ranked]


def same_line(existing: list[dict[str, Any]], proposed: list[dict[str, Any]]) -> bool:
    """Si la celda ya dice lo mismo que el paipu, salvo mayúsculas y espacios."""
    def shape(results: list[dict[str, Any]]) -> list[tuple[str, int]]:
        return [(str(item["name"]).strip().lower(), int(item["scoreRaw"])) for item in results]

    return shape(existing) == shape(proposed)


# ----------------------------------------------------------------- reporte


def build_report(
    tables: list[dict[str, Any]],
    sheets: dict[str, dict[str, Any]],
    rosters: dict[str, list[dict[str, Any]]],
    histories: dict[str, dict[str, Any]],
    slots: dict[tuple[str, int, int], int],
    cache_dir: Path,
    avisos: list[str],
) -> dict[str, Any]:
    """Una fila por hanchan del Calendario: qué celda toca y qué va en ella."""
    rows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = [{"type": "MESA_REALINEADA", "message": aviso} for aviso in avisos]
    # Una mesa del Game History con algo escrito ya es de un grupo: la mesa del
    # Calendario que todavía no tiene la suya sólo puede ir a una libre.
    claimed: dict[tuple[str, int], set[int]] = defaultdict(set)
    for cell, taken in slots_in_use(histories).items():
        claimed[cell].update(taken)

    for table in tables:
        division, session = table["division"], table["session"]
        sheet = sheets[division]
        roster = rosters[division]
        results: dict[int, dict[str, Any]] = {}
        for game in range(1, GAMES_PER_TABLE + 1):
            cell_info = table["cells"].get(game) or {}
            uuid = cell_info.get("uuid")
            if not uuid:
                results[game] = {"detail": "El Calendario todavía no tiene el paipu de esta partida"}
                continue
            parsed, error = load_parsed(uuid, cache_dir)
            if parsed is None:
                results[game] = {"uuid": uuid, "detail": error}
                continue
            problems = score_problems(list(parsed.final_scores))
            if problems:
                issues.append({
                    "type": "PAIPU_INVALIDO",
                    "message": f"{table['key']}-G{game} ({uuid}): " + "; ".join(problems),
                })
                results[game] = {"uuid": uuid, "detail": "; ".join(problems)}
                continue
            names, identity, reason = resolve_seat_names(parsed, table["players"], roster)
            if names is None:
                issues.append({
                    "type": "SIN_IDENTIDAD",
                    "message": f"{table['key']}-G{game} ({uuid}): {reason}",
                })
                results[game] = {"uuid": uuid, "detail": reason}
                continue
            ranked = rank_seats(names, list(parsed.final_scores))
            results[game] = {
                "uuid": uuid, "ranked": ranked, "identity": identity, "detail": reason,
                "value": format_history_line(ranked),
            }

        slot = slots.get((division, session, table["table"]))
        if slot is None and any("ranked" in item for item in results.values()):
            available = usable_slots(sheet["rows"], session)
            slot = pick_slot(available, claimed[(division, session)], table["table"])
            if slot is None:
                issues.append({
                    "type": "SIN_MESA_LIBRE",
                    "message": (
                        f"División {division}, sesión {session}: la mesa {table['table']} del "
                        f"Calendario no tiene dónde ir en el Game History; sus {len(available)} "
                        f"mesas ya están ocupadas por otros grupos."
                    ),
                })
            else:
                claimed[(division, session)].add(slot)

        table_rows: list[dict[str, Any]] = []
        for game in range(1, GAMES_PER_TABLE + 1):
            result = results[game]
            label = (session, slot, game) if slot else None
            row_number = sheet["rows"].get(label) if label else None
            history_key = f"{division}-S{session}-M{slot}-G{game}" if slot else None
            existing = histories.get(history_key) if history_key else None
            cell = f"{quote_sheet(sheet['name'])}!B{row_number}" if row_number else None
            row = {
                "key": f"{table['key']}-G{game}",
                "division": division, "session": session, "table": table["table"],
                "historyTable": slot, "game": game,
                "label": f"S{session} M{slot} G{game}" if slot else None,
                "cell": cell, "uuid": result.get("uuid"),
                "identity": result.get("identity"),
                "value": None, "existing": existing["results"] if existing else None,
                "fixtureDate": table["date"], "fixturePlayers": table["players"],
                "seats": result.get("ranked") or [],
            }
            proposal = result.get("ranked")
            if proposal and existing and same_line(existing["results"], proposal):
                row["status"], row["detail"] = "OK", "La celda ya tiene este resultado"
            elif proposal and existing:
                row["status"] = "CONFLICTO"
                row["detail"] = (
                    f"La celda dice «{format_history_line(existing['results'])}» y el paipu "
                    f"{result['uuid']} dice «{result['value']}»; no se toca."
                )
            elif proposal and cell is None:
                row["status"] = "PENDIENTE"
                row["detail"] = (
                    f"{sheet['name']} no tiene fila rotulada «{row['label']}»" if slot
                    else f"{sheet['name']} no tiene ninguna mesa libre en la sesión {session}"
                )
            elif proposal:
                row["status"] = "REVISAR" if result["identity"] == "revisar" else "PROPUESTO"
                row["value"] = result["value"]
                row["detail"] = (
                    f"Celda vacía; {result['detail'].lower()}" if result["identity"] == "paipu"
                    else f"Celda vacía, pero {result['detail'].lower()}"
                )
            elif existing:
                row["status"] = "OK"
                row["detail"] = (
                    "Ya registrado a mano, sin paipu que lo verifique: "
                    f"{str(result.get('detail') or 'sin paipu')}"
                )
            else:
                row["status"] = "PENDIENTE"
                row["detail"] = result.get("detail") or "Sin paipu y sin resultado escrito"
            table_rows.append(row)

        # Un hanchan en conflicto deja a toda la mesa para revisión: la causa
        # típica es tener los dos paipus cruzados en el Calendario, y ahí pegar
        # el otro hanchan escribiría el resultado equivocado en la fila buena.
        if any(item["status"] == "CONFLICTO" for item in table_rows):
            for item in table_rows:
                if item["status"] == "PROPUESTO":
                    item["status"] = "REVISAR"
                    item["detail"] += "; otro hanchan de la mesa está en conflicto"
        rows.extend(table_rows)

    counts = {status: sum(1 for row in rows if row["status"] == status) for status in STATUS_ORDER}
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cacheDir": str(cache_dir),
        "summary": counts,
        "proposals": rows,
        "issues": issues,
    }


def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (
        STATUS_ORDER.index(row["status"]) if row["status"] in STATUS_ORDER else 99,
        row["division"], row["session"], row["table"], row["game"],
    ))


def writable_rows(report: dict[str, Any], include_review: bool) -> list[dict[str, Any]]:
    """Filas que el script puede pegar solo: celda vacía y paipu con identidad.

    `REVISAR` queda fuera por defecto porque el orden de los asientos salió del
    Calendario y no del registro; `--write-revisar` la incluye.
    """
    statuses = set(WRITE_STATUSES) | ({"REVISAR"} if include_review else set())
    return [row for row in sort_rows(report["proposals"]) if row["status"] in statuses and row["value"] and row["cell"]]


# --------------------------------------------------------------- escritura


def apply_writes(client: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Escribe las celdas propuestas, saltando las que dejaron de estar vacías.

    El reporte se armó sobre una copia descargada de la planilla, así que antes
    de escribir se relee cada celda: si alguien la llenó en el medio, se informa
    y no se toca. Un resultado ya escrito nunca se sobrescribe.
    """
    entries: list[dict[str, Any]] = []
    current = client.read_cells([row["cell"] for row in rows])
    updates: dict[str, str] = {}
    for row in rows:
        existing = str(current.get(row["cell"], "") or "").strip()
        entry = {"cell": row["cell"], "key": row["key"], "value": row["value"]}
        if existing:
            same = existing.replace(" ", "").lower() == row["value"].replace(" ", "").lower()
            entry["outcome"] = "OK" if same else "OMITIDO"
            entry["detail"] = (
                "La celda ya tenía este resultado" if same
                else f"La celda dejó de estar vacía («{existing}»); no se toca"
            )
        else:
            entry["outcome"] = "ESCRITO"
            entry["detail"] = "Celda vacía; resultado pegado"
            updates[row["cell"]] = row["value"]
        entries.append(entry)
        row["writeOutcome"] = entry["outcome"]
    updated = client.write_cells(updates) if updates else 0
    return {
        "mode": "aplicado", "account": client.account_email,
        "spreadsheetId": client.spreadsheet_id,
        "attempted": len(rows), "written": len(updates), "updatedCells": updated,
        "skipped": sum(1 for entry in entries if entry["outcome"] == "OMITIDO"),
        "already": sum(1 for entry in entries if entry["outcome"] == "OK"),
        "entries": entries, "error": None,
    }


def planned_writes(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Lo que escribiría `--write`, sin tocar la planilla."""
    for row in rows:
        row["writeOutcome"] = "SIMULADO"
    return {
        "mode": "simulacro", "account": None, "spreadsheetId": None,
        "attempted": len(rows), "written": 0, "updatedCells": 0, "skipped": 0, "already": 0,
        "entries": [
            {"cell": row["cell"], "key": row["key"], "value": row["value"],
             "outcome": "SIMULADO", "detail": "Se pegaría con --write"}
            for row in rows
        ],
        "error": None,
    }


# ----------------------------------------------------------------- salidas


def render_text(report: dict[str, Any]) -> str:
    lines = ["Celdas: " + ", ".join(f"{key}={value}" for key, value in report["summary"].items()), ""]
    actionable = [row for row in sort_rows(report["proposals"]) if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO")]
    if actionable:
        lines.append("Celdas a completar:")
        for row in actionable:
            outcome = f"  → {row['writeOutcome']}" if row.get("writeOutcome") else ""
            lines.append(f"  [{row['status']}] {row['cell'] or '—'}  {row['key']}  ({row['label'] or 'sin fila'}){outcome}")
            lines.append(f"      {row['value'] or row['detail']}")
    else:
        lines.append("No hay celdas nuevas que completar.")
    pendientes = [row for row in report["proposals"] if row["status"] == "PENDIENTE"]
    if pendientes:
        lines += ["", f"Sin resultado utilizable: {len(pendientes)} celdas "
                      f"({', '.join(row['key'] for row in pendientes[:12])}"
                      f"{', …' if len(pendientes) > 12 else ''})"]
    write = report.get("write")
    if write:
        lines.append("")
        if write["mode"] == "simulacro":
            lines.append(f"Planilla: {write['attempted']} celdas listas para pegar (usa --write para escribirlas)")
        else:
            lines.append(
                f"Planilla: {write['written']} celdas escritas, {write['already']} ya estaban, "
                f"{write['skipped']} omitidas (cuenta {write['account']})"
            )
        for entry in write["entries"]:
            if entry["outcome"] in ("OMITIDO", "ERROR"):
                lines.append(f"  [{entry['outcome']}] {entry['cell']}: {entry['detail']}")
        if write.get("error"):
            lines.append(f"  ERROR de escritura: {write['error']}")
    logs = report.get("logs")
    if logs:
        lines += ["", f"Logs: {len(logs['downloaded'])} descargados, {len(logs['deferred'])} aplazados "
                      f"de {logs['missing']} faltantes (tope {logs['limit']} por corrida)"]
        for failure in logs["failures"]:
            lines.append(f"  [LOG] {failure}")
        if logs.get("error"):
            lines.append(f"  ERROR de descarga: {logs['error']}")
    if report["issues"]:
        lines += ["", "Avisos:"]
        for issue in report["issues"]:
            lines.append(f"  [{issue['type']}] {issue['message']}")
    return "\n".join(lines)


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "## Paipus → Game History",
        "",
        "- Celdas: " + ", ".join(f"`{key}` {value}" for key, value in report["summary"].items()),
    ]
    write = report.get("write")
    if write:
        lines.append(
            f"- Planilla: **{write['written']}** escritas, {write['already']} ya estaban, "
            f"{write['skipped']} omitidas"
            if write["mode"] == "aplicado"
            else f"- Planilla: **{write['attempted']}** celdas listas para pegar (simulacro, sin `--write`)"
        )
    logs = report.get("logs")
    if logs:
        lines.append(
            f"- Logs: **{len(logs['downloaded'])}** descargados, {len(logs['deferred'])} aplazados "
            f"de {logs['missing']} faltantes"
        )
    lines.append("")
    actionable = [row for row in sort_rows(report["proposals"]) if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO")]
    if actionable:
        lines += [
            "| Estado | Celda | Hanchan | Fila | Escritura | Valor a pegar |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for row in actionable:
            lines.append(
                f"| {row['status']} | `{row['cell'] or '—'}` | {row['key']} | {row['label'] or '—'} | "
                f"{row.get('writeOutcome') or '—'} | {row['value'] or row['detail']} |"
            )
    else:
        lines.append("No hay celdas nuevas que completar.")
    if write and write.get("error"):
        lines += ["", f"> **Error de escritura:** {write['error']}"]
    if report["issues"]:
        lines += ["", "### Avisos", ""]
        for issue in report["issues"]:
            lines.append(f"- **{issue['type']}**: {issue['message']}")
    return "\n".join(lines) + "\n"


def log_report(candidates: list[str], cache_dir: Path, limit: int,
               fetched: RecordFetchResult | None, error: str | None = None) -> dict[str, Any]:
    """Qué paipus faltaban y cuáles quedaron bajados; `fetched=None` si no corrió."""
    pending = pending_record_uuids(candidates, cache_dir) if fetched is None else fetched.pending
    return {
        "cacheDir": str(cache_dir), "limit": limit, "candidates": len(candidates),
        "missing": len(pending),
        "downloaded": fetched.downloaded if fetched else [],
        "deferred": fetched.deferred if fetched else pending,
        "failures": fetched.failures if fetched else [],
        "error": error,
    }


def write_outputs(report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "game-history.json"
    csv_path = output_dir / "game-history.csv"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["celda", "valor", "estado", "escritura", "hanchan", "fila", "paipu", "detalle"])
        for row in sort_rows(report["proposals"]):
            if row["status"] == "PENDIENTE":
                continue
            writer.writerow([
                row["cell"] or "", row["value"] or "", row["status"], row.get("writeOutcome") or "",
                row["key"], row["label"] or "", row["uuid"] or "", row["detail"],
            ])
    return json_path, csv_path


# -------------------------------------------------------------------- CLI


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Completa Game History A/B con los puntajes que declaran los paipus"
    )
    parser.add_argument("--config", type=Path, default=ROOT / "sync-config.json")
    parser.add_argument("--xlsx", type=Path, help="Usa una copia local del Sheet en vez de descargarlo")
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    parser.add_argument("--write", action="store_true",
                        help="Escribe en el Google Sheet las celdas PROPUESTO (requiere cuenta de servicio)")
    parser.add_argument("--write-revisar", action="store_true",
                        help="Con --write, también pega las celdas REVISAR (asientos sin identidad en el paipu)")
    parser.add_argument("--credentials", type=Path,
                        help=f"JSON de la cuenta de servicio de Google (por defecto {CREDENTIALS_ENV})")
    parser.add_argument("--fetch-logs", action="store_true",
                        help="Descarga a data/raw-paipu los paipus que falten, con la sesión técnica")
    parser.add_argument("--logs-dir", type=Path, default=ROOT / "data" / "raw-paipu")
    parser.add_argument("--max-logs", type=int, default=MAX_RECORDS_PER_RUN,
                        help=f"Tope de paipus a descargar por corrida (por defecto {MAX_RECORDS_PER_RUN})")
    parser.add_argument("--fail-on-issues", action="store_true",
                        help="Sale con error si hay conflictos o avisos")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    for stream in (sys.stdout, sys.stderr):
        # El reporte lleva acentos y guiones largos; en consolas Windows cp1252
        # imprimirlos sin esto puede reventar la corrida.
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    temp_path: Path | None = None
    try:
        # Las credenciales se validan antes de bajar nada: si falta la cuenta de
        # servicio, mejor fallar temprano que después de descargar paipus.
        credentials = None
        if args.write:
            if not (args.credentials or has_credentials()):
                raise SyncError(
                    f"--write necesita la cuenta de servicio de Google: define {CREDENTIALS_ENV} "
                    f"con el JSON (o pasa --credentials)"
                )
            credentials = load_service_account(args.credentials)
        config = load_config(args.config)
        if args.xlsx:
            source = args.xlsx
        else:
            handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
            handle.close()
            temp_path = Path(handle.name)
            download_sheet(config["spreadsheetId"], temp_path)
            source = temp_path
        workbook = load_workbook(source, data_only=False)
        rosters = {division: read_roster(workbook, division, rule["rosterSheet"])
                   for division, rule in config["divisions"].items()}
        fixtures, submissions = read_calendar(workbook)
        tables = build_tables(submissions)
        sheets = read_history_sheets(workbook, config)
        histories: dict[str, dict[str, Any]] = {}
        for division, rule in config["divisions"].items():
            histories.update(parse_history(workbook, division, rule["historySheet"], rule))
        aligned, avisos = align_history_with_fixtures(histories, fixtures)
        slots = slots_by_table(aligned, fixtures)

        candidates = [str(item["uuid"]).lower() for item in submissions if item.get("uuid")]
        fetched: RecordFetchResult | None = None
        fetch_error: str | None = None
        if args.fetch_logs:
            # Descargar antes de analizar: lo recién bajado también se propone.
            # `fetch_missing_records` ya filtra lo que está en caché y exige la
            # sesión técnica, así que acá sólo se reporta lo que salga mal.
            try:
                fetched = fetch_missing_records(candidates, args.logs_dir, args.max_logs)
            except PaipuError as exc:
                fetch_error = str(exc)
                print(f"AVISO: no se pudieron descargar los paipus faltantes: {exc}", file=sys.stderr)

        report = build_report(tables, sheets, rosters, histories, slots, args.logs_dir, avisos)
        if args.fetch_logs:
            report["logs"] = log_report(candidates, args.logs_dir, args.max_logs, fetched, fetch_error)
        rows = writable_rows(report, args.write_revisar)
        report["write"] = planned_writes(rows) if not args.write else None

        write_failed = False
        if args.write:
            client = SheetsClient(config["spreadsheetId"], credentials or {})
            try:
                report["write"] = apply_writes(client, rows)
            except SheetsError as exc:
                write_failed = True
                for row in rows:
                    row["writeOutcome"] = "ERROR"
                report["write"] = {
                    "mode": "aplicado", "account": client.account_email,
                    "spreadsheetId": client.spreadsheet_id, "attempted": len(rows),
                    "written": 0, "updatedCells": 0, "skipped": 0, "already": 0,
                    "entries": [], "error": str(exc),
                }
                print(f"ERROR al escribir en la planilla: {exc}", file=sys.stderr)

        json_path, csv_path = write_outputs(report, args.output)
        print(render_text(report))
        print(f"\nReporte: {json_path}\nCSV: {csv_path}")
        append_step_summary(render_markdown(report))
        if write_failed:
            return 1
        blocking = [row for row in report["proposals"] if row["status"] == "CONFLICTO"]
        if args.fail_on_issues and (blocking or report["issues"]):
            raise SyncError(
                f"{len(blocking)} conflictos y {len(report['issues'])} avisos; revisa el reporte"
            )
        return 0
    except (SyncError, SheetsError, PaipuError, KeyError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
