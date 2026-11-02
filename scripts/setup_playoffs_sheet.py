#!/usr/bin/env python3
"""Actualiza la hoja Playoffs al cuadro de 16 y conserva lo ya escrito.

Lo que conserva, por rótulo de la columna A (`QF M1 G1`…): resultado (B),
fecha (C), hora (D) y paipu (F). Lo demás —títulos, siembra, fórmulas— se
reescribe. Las filas de partidas son las que leen `scripts/sync.py` y
`scripts/fill_calendar_paipus.py`; la numeración de las mesas de cuartos es la
del sitio (`playoffSeeding` en components-playoffs.jsx)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.gsheets import SheetsClient, load_service_account, quote_sheet
from scripts.majsoul import PAIPU_RE

ROOT = Path(__file__).resolve().parents[1]
SHEET = "Playoffs"
HEADERS = ["Partida", "Resultado (Jugador,Puntaje,... de 1° a 4°)", "Fecha", "Hora", "Reglas", "Paipu"]
# Columnas que se conservan al rehacer la hoja: lo que escribe una persona o
# el job de paipus. E (reglas) sale del formato y se reescribe siempre.
KEPT_COLUMNS = ("B", "C", "D", "F")
# Siembra cruzada en espejo, en el orden de las mesas del sitio: (A, A, B, B)
# por mesa. M1 = A1 A2 B7 B8, M2 = A3 A4 B5 B6, M3 = B1 B2 A7 A8, M4 = B3 B4 A5 A6.
PAIRINGS = [(1, 2, 7, 8), (3, 4, 5, 6), (7, 8, 1, 2), (5, 6, 3, 4)]
MATCHES = [
    *[(f"QF M{table} G{game}", "A" if table <= 2 else "B") for table in range(1, 5) for game in range(1, 3)],
    *[(f"SF M{table} G{game}", "A" if table == 1 else "B") for table in range(1, 3) for game in range(1, 3)],
    *[(f"FINAL G{game}", "A") for game in range(1, 4)],
]


def kept_value(column: str, value: object) -> object:
    """Lo que vale la pena conservar de una celda al rehacer la hoja.

    La hoja vieja usaba esas columnas para otra cosa (fórmulas que partían el
    resultado en jugador y puntaje). Conservarlas tal cual dejó una fórmula en
    F24, que `sync.py` leyó como enlace de paipu. Por eso una fórmula no se
    conserva nunca, y en Paipu sólo un valor que traiga un UUID de paipu."""
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("="):
            return ""
        if column == "F" and not PAIPU_RE.search(text):
            return ""
        return text
    if column == "F":
        return ""
    return value


def cells(previous: dict[str, dict[str, object]] | None = None) -> dict[str, object]:
    """Todas las celdas de la hoja. `previous` es `{rótulo: {columna: valor}}`."""
    previous = previous or {}
    values: dict[str, object] = {
        "A1": "Playoffs — 16 clasificados · Cuartos · Semifinales · Final",
        "A2": "Top 8 de cada división. Avanzan los 2 mejores de cada mesa; cuartos y semifinales tienen 2 hanchan, la final 3.",
        "A4": "Seed A", "B4": "Clasificado División A", "C4": "Seed B", "D4": "Clasificado División B",
        **{f"{column}15": header for column, header in zip("ABCDEF", HEADERS)},
        "G4": "Mesa", "H4": "Participantes de cuartos", "I4": "Reglas",
    }
    for seed in range(1, 9):
        row = 4 + seed
        values[f"A{row}"] = seed
        values[f"B{row}"] = f"='Clasificación'!B{row}"
        values[f"C{row}"] = seed
        values[f"D{row}"] = f"='Clasificación'!T{row}"
    for table, (a1, a2, b1, b2) in enumerate(PAIRINGS, start=1):
        row = 4 + table
        values[f"G{row}"] = f"QF M{table}"
        values[f"H{row}"] = f"=B{4+a1}&\", \"&B{4+a2}&\", \"&D{4+b1}&\", \"&D{4+b2}"
        values[f"I{row}"] = f"División {'A' if table <= 2 else 'B'}"
    for offset, (label, division) in enumerate(MATCHES, start=16):
        values[f"A{offset}"] = label
        for column in KEPT_COLUMNS:
            values[f"{column}{offset}"] = kept_value(column, previous.get(label, {}).get(column, ""))
        values[f"E{offset}"] = f"División {division}"
    values["A33"] = "Carga oficial"
    values["A34"] = "El job de paipus completa B, C, D y F solo con las partidas de las salas; nunca pisa una celda escrita."
    values["A35"] = "A mano: resultado del 1° al 4° en B (formato Game History, NOT delante del suplente) y el enlace en F."
    values["A36"] = "El sincronizador publica el paipu (con replay) o, si no hay, la columna B, con el uma de la regla de cada mesa."
    return values


def update_xlsx(source: Path, destination: Path) -> None:
    workbook = load_workbook(source)
    ws = workbook[SHEET]
    previous = {
        " ".join(str(ws.cell(row, 1).value or "").split()).upper(): {
            column: ws[f"{column}{row}"].value if ws[f"{column}{row}"].value is not None else ""
            for column in KEPT_COLUMNS
        }
        for row in range(1, ws.max_row + 1)
    }
    for merged in list(ws.merged_cells.ranges):
        ws.unmerge_cells(str(merged))
    for row in ws.iter_rows():
        for cell in row:
            cell.value = None
    for address, value in cells(previous).items():
        ws[address] = value
    for row in (1, 4, 15, 33):
        for cell in ws[row][:9]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="334155")
    for column, width in {"A": 16, "B": 54, "C": 14, "D": 12, "E": 16, "F": 60, "G": 12, "H": 62, "I": 16}.items():
        ws.column_dimensions[column].width = width
    ws.freeze_panes = "A16"
    workbook.save(destination)


def update_google(config: dict, credentials: Path | None) -> None:
    client = SheetsClient(config["spreadsheetId"], load_service_account(credentials))
    quoted = quote_sheet(SHEET)
    labels = [f"{quoted}!A{row}" for row in range(1, 101)]
    kept = [f"{quoted}!{column}{row}" for row in range(1, 101) for column in KEPT_COLUMNS]
    current = client.read_cells(labels + kept)
    previous: dict[str, dict[str, object]] = {}
    for row in range(1, 101):
        label = " ".join(current.get(f"{quoted}!A{row}", "").split()).upper()
        if label:
            previous[label] = {column: current.get(f"{quoted}!{column}{row}", "") for column in KEPT_COLUMNS}
    updates = {f"{quoted}!{column}{row}": "" for row in range(1, 101) for column in "ABCDEFGHI"}
    updates.update({f"{quoted}!{address}": value for address, value in cells(previous).items()})
    client.write_cells(updates, value_input_option="USER_ENTERED")
    print(f"Hoja {SHEET} actualizada con {client.account_email}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, help="Planilla local que se actualizará")
    parser.add_argument("--output", type=Path, help="Salida; por defecto reemplaza --xlsx")
    parser.add_argument("--write", action="store_true", help="Escribe directamente en Google Sheets")
    parser.add_argument("--credentials", type=Path)
    parser.add_argument("--config", type=Path, default=ROOT / "sync-config.json")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.write:
        update_google(json.loads(args.config.read_text(encoding="utf-8")), args.credentials)
    elif args.xlsx:
        output = args.output or args.xlsx
        update_xlsx(args.xlsx, output)
        print(f"Planilla actualizada: {output}")
    else:
        parser.error("usa --xlsx ARCHIVO o --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
