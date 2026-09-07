#!/usr/bin/env python3
"""Cruza las salas de torneo de Mahjong Soul con el Calendario de la planilla.

Lee el historial de partidas de las salas de División A y B, lo empareja con las
mesas del Calendario por coincidencia de jugadores y resuelve qué enlace va en
cada celda `Paipu G1` / `Paipu G2` que todavía está vacía.

Por defecto solo propone celda y valor. Con `--write` pega esas celdas en el
Google Sheet mediante una cuenta de servicio, y con `--fetch-logs` aprovecha la
misma sesión técnica para bajar a `data/raw-paipu` los paipus que falten. Nunca
sobrescribe una celda con un paipu ya cargado: CONFLICTO y REVISAR siguen siendo
decisión humana.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl import load_workbook

from scripts.gsheets import CREDENTIALS_ENV, SheetsClient, SheetsError, has_credentials, load_service_account
from scripts.majsoul import (
    MAX_RECORDS_PER_RUN, ContestGame, PaipuError, RecordFetchResult,
    fetch_contest_games_and_records, fetch_missing_records, pending_record_uuids,
)
from scripts.sync import SyncError, download_sheet, load_config, read_calendar, read_roster


ROOT = Path(__file__).resolve().parents[1]
# Tres jugadores en común alcanzan: el reparto de mesas nunca se repite en la
# liga, así que ni un sustituto rompe la identificación de la mesa.
MIN_PLAYER_OVERLAP = 3
PAIPU_URL = "https://mahjongsoul.game.yo-star.com/?paipu={uuid}"
LEAGUE_TIMEZONE = "America/Santiago"
GAMES_PER_TABLE = 2
# Orden de severidad para el resumen y el ordenamiento del reporte.
STATUS_ORDER = ["PROPUESTO", "REVISAR", "CONFLICTO", "PENDIENTE", "OK"]
# Lo único que el script pega solo: celda vacía con una partida sin ambigüedad.
WRITE_STATUSES = ("PROPUESTO",)


def league_timezone() -> Any:
    """Zona horaria de la liga; cae a UTC si el sistema no trae la base tz."""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(LEAGUE_TIMEZONE)
    except Exception:
        print(
            f"AVISO: no se pudo cargar la zona horaria {LEAGUE_TIMEZONE} "
            f"(instala tzdata); las fechas del torneo se muestran en UTC.",
            file=sys.stderr,
        )
        return timezone.utc


def local_datetime(timestamp: int, tz: Any) -> datetime | None:
    if not timestamp:
        return None
    return datetime.fromtimestamp(int(timestamp), tz)


def local_stamp(timestamp: int, tz: Any) -> str:
    moment = local_datetime(timestamp, tz)
    return moment.strftime("%Y-%m-%d %H:%M") if moment else "—"


def index_roster(players: list[dict[str, Any]]) -> dict[str, Any]:
    """Índices para resolver un asiento del torneo a un jugador de la liga."""
    return {
        "byAccount": {p["accountId"]: p for p in players if p.get("accountId") is not None},
        "byName": {p["name"].strip().lower(): p for p in players if p.get("name")},
    }


def resolve_seats(game: ContestGame, index: dict[str, Any]) -> list[dict[str, Any]]:
    """Anota cada asiento con el jugador de liga al que corresponde (o None)."""
    seats = []
    for seat in game.seats:
        player = index["byAccount"].get(seat.get("accountId"))
        if player is None and seat.get("nickname"):
            player = index["byName"].get(str(seat["nickname"]).strip().lower())
        seats.append({**seat, "playerId": player["id"] if player else None,
                      "playerName": player["name"] if player else None})
    return seats


def resolve_table_players(names: list[str], index: dict[str, Any]) -> tuple[set[str], list[str]]:
    """IDs de liga de los cuatro nombres del fixture, más los que no resuelven."""
    ids: set[str] = set()
    unresolved: list[str] = []
    for name in names:
        clean = str(name or "").strip()
        if not clean:
            continue
        player = index["byName"].get(clean.lower())
        if player:
            ids.add(player["id"])
        else:
            unresolved.append(clean)
    return ids, unresolved


def build_tables(submissions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa las 168 celdas del Calendario en sus 84 mesas."""
    tables: dict[tuple[str, int, int], dict[str, Any]] = {}
    for entry in submissions:
        key = (entry["division"], entry["session"], entry["table"])
        table = tables.setdefault(key, {
            "key": f"{entry['division']}-S{entry['session']}-M{entry['table']}",
            "division": entry["division"], "session": entry["session"], "table": entry["table"],
            "players": entry["players"], "date": entry["date"], "dateISO": entry["dateISO"],
            "cells": {},
        })
        table["cells"][entry["game"]] = {
            "cell": entry["cell"], "url": entry.get("url", ""), "uuid": entry.get("uuid"),
        }
    return [tables[key] for key in sorted(tables)]


def match_games(
    tables: list[dict[str, Any]],
    games: list[ContestGame],
    indexes: dict[str, dict[str, Any]],
    tz: Any,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Empareja cada partida del torneo con una mesa del Calendario.

    Gana la mesa con más jugadores en común (mínimo `MIN_PLAYER_OVERLAP`). Si dos
    mesas empatan, desempata la fecha del fixture; si tampoco, la partida queda
    sin asignar y se reporta.
    """
    context = []
    for table in tables:
        ids, unresolved = resolve_table_players(table["players"], indexes[table["division"]])
        context.append({"table": table, "ids": ids, "unresolved": unresolved})

    matched: dict[str, list[dict[str, Any]]] = defaultdict(list)
    issues: list[dict[str, Any]] = []
    for game in games:
        index = indexes.get(game.division)
        if index is None:
            continue
        seats = resolve_seats(game, index)
        game_ids = {seat["playerId"] for seat in seats if seat["playerId"]}
        scored = [
            (len(game_ids & item["ids"]), item["table"])
            for item in context if item["table"]["division"] == game.division
        ]
        best = max((count for count, _ in scored), default=0)
        winners = [table for count, table in scored if count == best]
        if best < MIN_PLAYER_OVERLAP:
            issues.append({
                "type": "SIN_MESA", "division": game.division, "uuid": game.uuid,
                "start": local_stamp(game.startTime, tz),
                "message": (
                    f"La partida {game.uuid} (División {game.division}, "
                    f"{local_stamp(game.startTime, tz)}) coincide en {best} jugador(es) con "
                    f"la mejor mesa; se necesitan {MIN_PLAYER_OVERLAP}."
                ),
                "players": [seat.get("playerName") or seat.get("nickname") for seat in seats],
            })
            continue
        if len(winners) > 1:
            game_date = local_datetime(game.startTime, tz)
            same_date = [
                table for table in winners
                if game_date and table["dateISO"] and table["dateISO"] == game_date.date().isoformat()
            ]
            if len(same_date) == 1:
                winners = same_date
            else:
                issues.append({
                    "type": "AMBIGUA", "division": game.division, "uuid": game.uuid,
                    "start": local_stamp(game.startTime, tz),
                    "message": (
                        f"La partida {game.uuid} coincide en {best} jugadores con "
                        f"{len(winners)} mesas: " + ", ".join(table["key"] for table in winners)
                        + ". Sin fecha que desempate; queda sin asignar."
                    ),
                    "players": [seat.get("playerName") or seat.get("nickname") for seat in seats],
                })
                continue
        matched[winners[0]["key"]].append({"game": game, "overlap": best, "seats": seats})
    for entries in matched.values():
        entries.sort(key=lambda item: item["game"].startTime)
    return matched, issues


def paipu_url(game: ContestGame) -> str:
    """Enlace del replay, sin el ancla `_a`: el sincronizador la ignora igual."""
    return PAIPU_URL.format(uuid=game.uuid)


def build_report(
    tables: list[dict[str, Any]],
    matched: dict[str, list[dict[str, Any]]],
    issues: list[dict[str, Any]],
    contests: dict[str, str],
    games: list[ContestGame],
    indexes: dict[str, dict[str, Any]],
    tz: Any,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    report_issues = list(issues)
    for table in tables:
        entries = matched.get(table["key"], [])
        if len(entries) < GAMES_PER_TABLE:
            # Un nombre del Calendario que no está en el roster baja la
            # coincidencia; conviene saberlo cuando la mesa quedó incompleta.
            _ids, unresolved = resolve_table_players(table["players"], indexes[table["division"]])
            if unresolved:
                report_issues.append({
                    "type": "NOMBRE_DESCONOCIDO", "division": table["division"], "uuid": None,
                    "start": None,
                    "message": (
                        f"La mesa {table['key']} nombra a {', '.join(unresolved)}, "
                        f"que no está en el roster de División {table['division']}."
                    ),
                    "players": table["players"],
                })
        extra = entries[GAMES_PER_TABLE:]
        if extra:
            report_issues.append({
                "type": "MESA_CON_EXTRAS", "division": table["division"], "uuid": None,
                "start": None,
                "message": (
                    f"La mesa {table['key']} tiene {len(entries)} partidas en el torneo y el "
                    f"Calendario solo admite {GAMES_PER_TABLE}: "
                    + ", ".join(
                        f"{item['game'].uuid} ({local_stamp(item['game'].startTime, tz)})"
                        for item in entries
                    )
                    + ". Se proponen las dos más tempranas; revisa cuál corresponde."
                ),
                "players": table["players"],
            })
        for game_no in range(1, GAMES_PER_TABLE + 1):
            cell = table["cells"].get(game_no, {"cell": "?", "url": "", "uuid": None})
            entry = entries[game_no - 1] if len(entries) >= game_no else None
            proposal = paipu_url(entry["game"]) if entry else None
            if entry and not cell["url"]:
                status = "REVISAR" if extra else "PROPUESTO"
                detail = "Celda vacía; enlace propuesto"
            elif entry and cell["uuid"] == entry["game"].uuid:
                status, detail = "OK", "La celda ya tiene esta partida"
            elif entry and cell["url"]:
                status = "CONFLICTO"
                detail = (
                    f"La celda ya tiene {cell['uuid']} y el torneo entrega "
                    f"{entry['game'].uuid}; no se toca."
                )
            elif cell["url"]:
                status, detail = "OK", "La celda ya tiene un paipu que el torneo no devolvió"
            else:
                status, detail = "PENDIENTE", "Sin partida en el torneo para esta mesa"
            rows.append({
                "cell": cell["cell"],
                "key": f"{table['key']}-G{game_no}",
                "division": table["division"], "session": table["session"],
                "table": table["table"], "game": game_no,
                "status": status, "detail": detail,
                "value": proposal if status in ("PROPUESTO", "REVISAR") else None,
                "uuid": entry["game"].uuid if entry else None,
                "start": local_stamp(entry["game"].startTime, tz) if entry else None,
                "matchedPlayers": entry["overlap"] if entry else 0,
                "existingUrl": cell["url"] or None,
                "fixtureDate": table["date"], "fixturePlayers": table["players"],
                "seats": [
                    {
                        "seat": seat["seat"],
                        "player": seat.get("playerName") or seat.get("nickname"),
                        "scoreRaw": seat.get("scoreRaw"),
                    }
                    for seat in (entry["seats"] if entry else [])
                ],
            })
    counts = {status: sum(1 for row in rows if row["status"] == status) for status in STATUS_ORDER}
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "timezone": str(tz),
        "contests": contests,
        "gamesFound": len(games),
        "gamesMatched": sum(len(entries) for entries in matched.values()),
        "summary": counts,
        "proposals": rows,
        "issues": report_issues,
    }


def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (
        STATUS_ORDER.index(row["status"]) if row["status"] in STATUS_ORDER else 99,
        row["division"], row["session"], row["table"], row["game"],
    ))


def writable_rows(report: dict[str, Any], include_review: bool) -> list[dict[str, Any]]:
    """Filas que el script puede pegar solo: celda vacía y una partida clara.

    `REVISAR` queda fuera por defecto porque la mesa tiene partidas de más y la
    elección de cuáles son las buenas es humana; `--write-revisar` la incluye.
    """
    statuses = set(WRITE_STATUSES) | ({"REVISAR"} if include_review else set())
    return [row for row in sort_rows(report["proposals"]) if row["status"] in statuses and row["value"]]


def apply_writes(client: SheetsClient, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Escribe las celdas propuestas, saltando las que dejaron de estar vacías.

    El reporte se armó sobre una copia descargada de la planilla, así que antes
    de escribir se relee cada celda: si alguien la llenó en el medio, se informa
    y no se toca. El paipu ya cargado nunca se sobrescribe.
    """
    entries: list[dict[str, Any]] = []
    current = client.read_cells([row["cell"] for row in rows])
    updates: dict[str, str] = {}
    for row in rows:
        existing = current.get(row["cell"], "")
        entry = {"cell": row["cell"], "key": row["key"], "value": row["value"], "uuid": row["uuid"]}
        if existing:
            same = bool(row["uuid"]) and row["uuid"].lower() in existing.lower()
            entry["outcome"] = "OK" if same else "OMITIDO"
            entry["detail"] = (
                "La celda ya tenía este paipu" if same
                else f"La celda dejó de estar vacía ({existing}); no se toca"
            )
        else:
            entry["outcome"] = "ESCRITO"
            entry["detail"] = "Celda vacía; enlace pegado"
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
            {"cell": row["cell"], "key": row["key"], "value": row["value"], "uuid": row["uuid"],
             "outcome": "SIMULADO", "detail": "Se pegaría con --write"}
            for row in rows
        ],
        "error": None,
    }


def log_candidates(rows: list[dict[str, Any]], submissions: list[dict[str, Any]]) -> list[str]:
    """UUIDs cuyo paipu debería estar en `data/raw-paipu`, por orden de interés.

    Primero los que esta corrida va a pegar (son la novedad) y después los que
    el Calendario ya traía; el tope por corrida corta la cola y el resto lo
    completan las siguientes.
    """
    # En minúsculas, que es como `scripts/sync.py` nombra cada `.pb` en la caché.
    uuids = [str(row["uuid"]).lower() for row in rows if row.get("uuid")]
    uuids += [str(item["uuid"]).lower() for item in submissions if item.get("uuid")]
    seen: set[str] = set()
    return [uuid for uuid in uuids if uuid and not (uuid in seen or seen.add(uuid))]


def log_report(
    candidates: list[str], cache_dir: Path, limit: int,
    fetched: RecordFetchResult | None, error: str | None = None,
) -> dict[str, Any]:
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


def render_text(report: dict[str, Any]) -> str:
    lines = [
        f"Partidas en el torneo: {report['gamesFound']} "
        f"(emparejadas: {report['gamesMatched']})",
        "Celdas: " + ", ".join(f"{key}={value}" for key, value in report["summary"].items()),
        "",
    ]
    actionable = [row for row in sort_rows(report["proposals"]) if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO")]
    if actionable:
        lines.append("Celdas a completar:")
        for row in actionable:
            outcome = f"  → {row['writeOutcome']}" if row.get("writeOutcome") else ""
            lines.append(
                f"  [{row['status']}] {row['cell']}  {row['key']}  "
                f"{row['start'] or '—'}  {row['matchedPlayers']}/4 jugadores{outcome}"
            )
            lines.append(f"      {row['value'] or row['detail']}")
    else:
        lines.append("No hay celdas nuevas que completar.")
    pendientes = [row for row in report["proposals"] if row["status"] == "PENDIENTE"]
    if pendientes:
        lines.append("")
        lines.append(f"Sin partida en el torneo: {len(pendientes)} celdas "
                     f"({', '.join(row['key'] for row in pendientes[:12])}"
                     f"{', …' if len(pendientes) > 12 else ''})")
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
        lines.append("")
        lines.append(
            f"Logs: {len(logs['downloaded'])} descargados, {len(logs['deferred'])} aplazados "
            f"de {logs['missing']} faltantes (tope {logs['limit']} por corrida)"
        )
        for failure in logs["failures"]:
            lines.append(f"  [LOG] {failure}")
        if logs.get("error"):
            lines.append(f"  ERROR de descarga: {logs['error']}")
    if report["issues"]:
        lines.append("")
        lines.append("Avisos:")
        for issue in report["issues"]:
            lines.append(f"  [{issue['type']}] {issue['message']}")
    return "\n".join(lines)


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "## Paipus del torneo → Calendario",
        "",
        f"- Partidas leídas: **{report['gamesFound']}** (emparejadas: {report['gamesMatched']})",
        "- Celdas: " + ", ".join(f"`{key}` {value}" for key, value in report["summary"].items()),
        "- Torneos: " + ", ".join(f"División {div} = `{cid}`" for div, cid in report["contests"].items()),
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
            "| Estado | Celda | Mesa | Inicio | Jugadores | Escritura | Valor a pegar |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for row in actionable:
            value = row["value"] or row["detail"]
            lines.append(
                f"| {row['status']} | `{row['cell']}` | {row['key']} | {row['start'] or '—'} | "
                f"{row['matchedPlayers']}/4 | {row.get('writeOutcome') or '—'} | {value} |"
            )
    else:
        lines.append("No hay celdas nuevas que completar.")
    if write and write.get("error"):
        lines += ["", f"> **Error de escritura:** {write['error']}"]
    if logs and logs.get("error"):
        lines += ["", f"> **Error de descarga de logs:** {logs['error']}"]
    if report["issues"]:
        lines += ["", "### Avisos", ""]
        for issue in report["issues"]:
            lines.append(f"- **{issue['type']}**: {issue['message']}")
    return "\n".join(lines) + "\n"


def write_outputs(report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "calendar-paipus.json"
    csv_path = output_dir / "calendar-paipus.csv"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["celda", "valor", "estado", "escritura", "mesa", "inicio",
                         "jugadores_coincidentes", "detalle"])
        for row in sort_rows(report["proposals"]):
            if row["status"] == "PENDIENTE":
                continue
            writer.writerow([
                row["cell"], row["value"] or "", row["status"], row.get("writeOutcome") or "",
                row["key"], row["start"] or "", row["matchedPlayers"], row["detail"],
            ])
    return json_path, csv_path


def append_step_summary(markdown: str) -> None:
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write(markdown)


def load_games(
    args: argparse.Namespace,
    contests: dict[str, str],
    plan: Callable[[list[ContestGame]], list[str]],
) -> tuple[list[ContestGame], RecordFetchResult | None]:
    """Partidas del torneo y, si se pidieron, los paipus bajados en ese mismo login."""
    if args.games_json:
        payload = json.loads(Path(args.games_json).read_text(encoding="utf-8"))
        return [ContestGame.from_dict(item) for item in payload], None
    games, fetched = fetch_contest_games_and_records(
        contests, plan, args.logs_dir if args.fetch_logs else None, args.max_logs,
    )
    if args.dump_games:
        Path(args.dump_games).write_text(
            json.dumps([game.to_dict() for game in games], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return games, fetched


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Completa los paipus faltantes del Calendario desde las salas de torneo"
    )
    parser.add_argument("--config", type=Path, default=ROOT / "sync-config.json")
    parser.add_argument("--xlsx", type=Path, help="Usa una copia local del Sheet en vez de descargarlo")
    parser.add_argument("--contest-a", default=os.environ.get("MAJSOUL_CONTEST_ID_A", ""),
                        help="ID de la sala de torneo de División A (por defecto MAJSOUL_CONTEST_ID_A)")
    parser.add_argument("--contest-b", default=os.environ.get("MAJSOUL_CONTEST_ID_B", ""),
                        help="ID de la sala de torneo de División B (por defecto MAJSOUL_CONTEST_ID_B)")
    parser.add_argument("--games-json", type=Path, help="Lee las partidas de un JSON en vez de Mahjong Soul")
    parser.add_argument("--dump-games", type=Path, help="Guarda las partidas leídas del torneo en un JSON")
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    parser.add_argument("--write", action="store_true",
                        help="Escribe en el Google Sheet las celdas PROPUESTO (requiere cuenta de servicio)")
    parser.add_argument("--write-revisar", action="store_true",
                        help="Con --write, también pega las celdas REVISAR (mesas con partidas de más)")
    parser.add_argument("--credentials", type=Path,
                        help=f"JSON de la cuenta de servicio de Google (por defecto {CREDENTIALS_ENV})")
    parser.add_argument("--fetch-logs", action="store_true",
                        help="Descarga a data/raw-paipu los paipus que falten, en la misma sesión técnica")
    parser.add_argument("--logs-dir", type=Path, default=ROOT / "data" / "raw-paipu")
    parser.add_argument("--max-logs", type=int, default=MAX_RECORDS_PER_RUN,
                        help=f"Tope de paipus a descargar por corrida (por defecto {MAX_RECORDS_PER_RUN})")
    parser.add_argument("--fail-on-issues", action="store_true",
                        help="Sale con error si hay conflictos o partidas sin mesa")
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

    contests = {division: str(value).strip()
                for division, value in (("A", args.contest_a), ("B", args.contest_b))
                if str(value).strip()}
    temp_path: Path | None = None
    try:
        if not contests and not args.games_json:
            raise SyncError(
                "Faltan los IDs de las salas de torneo: define MAJSOUL_CONTEST_ID_A y "
                "MAJSOUL_CONTEST_ID_B (o pasa --contest-a/--contest-b)"
            )
        # Las credenciales se validan antes de tocar Mahjong Soul: si falta la
        # cuenta de servicio, mejor fallar sin haber gastado un login.
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
        indexes = {division: index_roster(players) for division, players in rosters.items()}
        _fixtures, submissions = read_calendar(workbook)
        tables = build_tables(submissions)

        tz = league_timezone()
        state: dict[str, Any] = {}

        def analyze(games: list[ContestGame]) -> dict[str, Any]:
            matched, issues = match_games(tables, games, indexes, tz)
            report = build_report(tables, matched, issues, contests, games, indexes, tz)
            rows = writable_rows(report, args.write_revisar)
            # Sin --write el reporte deja anotado qué pegaría; con --write lo
            # llena `apply_writes` con lo que la planilla haya aceptado.
            report["write"] = planned_writes(rows) if not args.write else None
            state.update(report=report, rows=rows)
            return report

        def plan(games: list[ContestGame]) -> list[str]:
            report = analyze(games)
            if not args.fetch_logs:
                return []
            candidates = log_candidates(state["rows"], submissions)
            state["logCandidates"] = candidates
            return candidates

        games, fetched = load_games(args, contests, plan)
        if "report" not in state:
            # Con --games-json no hubo sesión de torneo: el análisis corre acá.
            analyze(games)
        report = state["report"]

        if args.fetch_logs and fetched is None:
            candidates = state.get("logCandidates") or log_candidates(state["rows"], submissions)
            state["logCandidates"] = candidates
            try:
                fetched = fetch_missing_records(candidates, args.logs_dir, args.max_logs)
            except PaipuError as exc:
                print(f"AVISO: no se pudieron descargar los paipus faltantes: {exc}", file=sys.stderr)
                report["logs"] = log_report(candidates, args.logs_dir, args.max_logs, None, str(exc))
        if args.fetch_logs and report.get("logs") is None:
            report["logs"] = log_report(
                state.get("logCandidates", []), args.logs_dir, args.max_logs, fetched,
            )

        write_failed = False
        if args.write:
            client = SheetsClient(config["spreadsheetId"], credentials or {})
            try:
                report["write"] = apply_writes(client, state["rows"])
            except SheetsError as exc:
                write_failed = True
                for row in state["rows"]:
                    row["writeOutcome"] = "ERROR"
                report["write"] = {
                    "mode": "aplicado", "account": client.account_email,
                    "spreadsheetId": client.spreadsheet_id, "attempted": len(state["rows"]),
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
