#!/usr/bin/env python3
"""Backfill award counters in versioned public data from cached paipus."""
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.majsoul import parse_record

ROOT = Path(__file__).resolve().parents[1]
data_path = ROOT / "data" / "liga.json"
stats_path = ROOT / "data" / "stats.json"
data = json.loads(data_path.read_text(encoding="utf-8"))
stats = json.loads(stats_path.read_text(encoding="utf-8"))
players = {p["id"]: p for div in data["divisions"].values() for p in div["players"]}
by_name = {p["name"].strip().lower(): p for p in players.values()}
totals = {pid: {"kans": 0, "doras": 0, "uraDoras": 0, "maxHonba": 0} for pid in players}

for match in (m for div in data["divisions"].values() for m in div.get("matches", [])):
    url = match.get("paipuUrl") or ""
    match_uuid = re.search(r"(\d{6}-[0-9a-fA-F-]{32,})", url)
    if not match_uuid:
        continue
    uuid = match_uuid.group(1).split("_", 1)[0]
    raw = ROOT / "data" / "raw-paipu" / f"{uuid}.pb"
    if not raw.exists():
        continue
    try:
        parsed = parse_record(uuid, raw.read_bytes())
    except Exception:
        continue
    roster = {p["name"].strip().lower(): p for p in match.get("players", [])}
    for seat, seat_stats in enumerate(parsed.seat_stats):
        nickname = str(parsed.players[seat].get("nickname") or "").strip().lower()
        match_player = roster.get(nickname)
        player = by_name.get(match_player["name"].strip().lower()) if match_player else None
        if not player:
            continue
        item = totals[player["id"]]
        for key in ("kans", "doras", "uraDoras"):
            item[key] += int(seat_stats.get(key, 0))
        item["maxHonba"] = max(item["maxHonba"], int(seat_stats.get("maxHonba", 0)))

for player in players.values():
    player.update(totals[player["id"]])
    if player["id"] in stats.get("players", {}):
        stats["players"][player["id"]].update(totals[player["id"]])

for div in data["divisions"].values():
    players_div = div["players"]
    records = [r for r in div.get("hallOfFame", []) if r.get("key") not in {"kans", "doras", "ura_doras", "renchan"}]
    for key, field, jp in (("kans", "kans", "槓"), ("doras", "doras", "ドラ"), ("ura_doras", "uraDoras", "裏ドラ"), ("renchan", "maxHonba", "連荘")):
        candidates = [p for p in players_div if p.get(field, 0) > 0]
        if candidates:
            winner = max(candidates, key=lambda p: (p[field], p["points"], p["name"].lower()))
            records.append({"key": key, "value": str(winner[field]), "player": winner, "jp": jp})
    div["hallOfFame"] = records

data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
stats_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data" / "generated.js").write_text("// Generado por scripts/backfill_awards.py.\nwindow.MJC_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print("Backfill de distinciones completado")
