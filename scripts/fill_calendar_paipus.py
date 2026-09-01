#!/usr/bin/env python3
"""Cruza las salas de torneo de Mahjong Soul con el Calendario de la planilla.

Lee el historial de partidas de las salas de División A y B, lo empareja con las
mesas del Calendario por coincidencia de jugadores y emite un reporte de qué
enlace va en cada celda `Paipu G1` / `Paipu G2` que todavía está vacía.

El script NO escribe en la planilla: solo propone celda y valor. El pegado lo
hace un humano, que también resuelve los casos marcados como CONFLICTO o
REVISAR.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl import load_workbook

from scripts.majsoul import ContestGame, PaipuError, fetch_contest_games
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
            lines.append(
                f"  [{row['status']}] {row['cell']}  {row['key']}  "
                f"{row['start'] or '—'}  {row['matchedPlayers']}/4 jugadores"
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
        "",
    ]
    actionable = [row for row in sort_rows(report["proposals"]) if row["status"] in ("PROPUESTO", "REVISAR", "CONFLICTO")]
    if actionable:
        lines += [
            "| Estado | Celda | Mesa | Inicio | Jugadores | Valor a pegar |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for row in actionable:
            value = row["value"] or row["detail"]
            lines.append(
                f"| {row['status']} | `{row['cell']}` | {row['key']} | {row['start'] or '—'} | "
                f"{row['matchedPlayers']}/4 | {value} |"
            )
    else:
        lines.append("No hay celdas nuevas que completar.")
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
        writer.writerow(["celda", "valor", "estado", "mesa", "inicio", "jugadores_coincidentes", "detalle"])
        for row in sort_rows(report["proposals"]):
            if row["status"] == "PENDIENTE":
                continue
            writer.writerow([
                row["cell"], row["value"] or "", row["status"], row["key"],
                row["start"] or "", row["matchedPlayers"], row["detail"],
            ])
    return json_path, csv_path


def append_step_summary(markdown: str) -> None:
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write(markdown)


def load_games(args: argparse.Namespace, contests: dict[str, str]) -> list[ContestGame]:
    if args.games_json:
        payload = json.loads(Path(args.games_json).read_text(encoding="utf-8"))
        return [ContestGame.from_dict(item) for item in payload]
    games = fetch_contest_games(contests)
    if args.dump_games:
        Path(args.dump_games).write_text(
            json.dumps([game.to_dict() for game in games], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return games


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Propone los paipus faltantes del Calendario desde las salas de torneo"
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
    parser.add_argument("--fail-on-issues", action="store_true",
                        help="Sale con error si hay conflictos o partidas sin mesa")
    args = parser.parse_args()
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
        games = load_games(args, contests)
        matched, issues = match_games(tables, games, indexes, tz)
        report = build_report(tables, matched, issues, contests, games, indexes, tz)
        json_path, csv_path = write_outputs(report, args.output)
        print(render_text(report))
        print(f"\nReporte: {json_path}\nCSV: {csv_path}")
        append_step_summary(render_markdown(report))
        blocking = [row for row in report["proposals"] if row["status"] == "CONFLICTO"]
        if args.fail_on_issues and (blocking or report["issues"]):
            raise SyncError(
                f"{len(blocking)} conflictos y {len(report['issues'])} avisos; revisa el reporte"
            )
        return 0
    except (SyncError, PaipuError, KeyError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
