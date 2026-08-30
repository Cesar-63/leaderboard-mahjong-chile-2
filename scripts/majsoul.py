from __future__ import annotations

import hashlib
import re
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PAIPU_RE = re.compile(r"(?P<uuid>\d{6}-[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?P<trailer>_a\d+)?")
RECORD_URL = "https://record-v2.maj-soul.com:5333/majsoul/game_record/{uuid}"


class PaipuError(RuntimeError):
    pass


class PaipuAuthRequired(PaipuError):
    pass


def extract_uuid(value: str) -> str:
    match = PAIPU_RE.search(value or "")
    if not match:
        raise PaipuError("El valor no contiene un UUID paipu válido")
    return match.group("uuid").lower()


def extract_record_id(value: str) -> str:
    match = PAIPU_RE.search(value or "")
    if not match:
        raise PaipuError("El valor no contiene un UUID paipu válido")
    return (match.group("uuid") + (match.group("trailer") or "")).lower()


def fetch_record(record_id: str, cache_dir: Path, uuid: str | None = None) -> bytes:
    uuid = uuid or extract_uuid(record_id)
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / f"{uuid}.pb"
    if destination.exists():
        return destination.read_bytes()
    request = urllib.request.Request(
        RECORD_URL.format(uuid=record_id),
        headers={"User-Agent": "LigaMahjongChile/1.0 (+paipu-importer)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except Exception as exc:
        raise PaipuError(f"No se pudo descargar el paipu: {exc}") from exc
    if not raw:
        raise PaipuError("Mahjong Soul devolvió un registro vacío")
    if raw.lstrip().startswith(b"<?xml"):
        raise PaipuAuthRequired("El registro reciente requiere una sesión técnica de Mahjong Soul")
    destination.write_bytes(raw)
    return raw


@dataclass
class ParsedPaipu:
    uuid: str
    final_scores: list[int]
    hands: int
    seat_stats: list[dict[str, Any]]
    sha256: str


def _protobuf_module():
    try:
        from ms import protocol_pb2 as pb  # type: ignore
    except ImportError as exc:
        raise PaipuError(
            "Falta ms_api/protobuf. Ejecuta: python -m pip install -r requirements.txt"
        ) from exc
    return pb


def parse_record(uuid: str, raw: bytes) -> ParsedPaipu:
    if raw.lstrip().startswith(b"<?xml"):
        raise PaipuAuthRequired("El registro reciente requiere una sesión técnica de Mahjong Soul")
    pb = _protobuf_module()
    wrapper = pb.Wrapper()
    try:
        wrapper.ParseFromString(raw)
    except Exception as exc:
        raise PaipuError(f"El registro no es un Wrapper protobuf válido: {exc}") from exc
    if not wrapper.name.endswith("GameDetailRecords"):
        raise PaipuError(f"Tipo protobuf inesperado: {wrapper.name or '(vacío)'}")

    details = pb.GameDetailRecords()
    details.ParseFromString(wrapper.data)
    payloads = list(details.records)
    if not payloads and details.actions:
        payloads = [action.data for action in details.actions]
    if not payloads:
        raise PaipuError("El paipu no contiene acciones")

    stats = [
        {"hands": 0, "wins": 0, "tsumo": 0, "ron": 0, "dealIns": 0,
         "riichis": 0, "openHands": 0, "yaku": Counter()}
        for _ in range(4)
    ]
    final_scores: list[int] = []
    round_index = -1
    opened: set[tuple[int, int]] = set()
    last_discard: int | None = None

    for payload in payloads:
        item = pb.Wrapper()
        item.ParseFromString(payload)
        name = item.name.rsplit(".", 1)[-1]
        message_type = getattr(pb, name, None)
        if message_type is None:
            continue
        message = message_type()
        message.ParseFromString(item.data)

        if name == "RecordNewRound":
            round_index += 1
            last_discard = None
            for seat in range(min(4, len(message.scores))):
                stats[seat]["hands"] += 1
            if message.scores:
                final_scores = list(message.scores)
        elif name == "RecordDiscardTile":
            seat = int(message.seat)
            last_discard = seat
            if message.is_liqi and seat < 4:
                stats[seat]["riichis"] += 1
        elif name in {"RecordChiPengGang", "RecordAnGangAddGang", "RecordBaBei"}:
            seat = int(message.seat)
            key = (round_index, seat)
            if seat < 4 and key not in opened:
                opened.add(key)
                stats[seat]["openHands"] += 1
        elif name == "RecordHule":
            if message.scores:
                final_scores = list(message.scores)
            elif message.old_scores and message.delta_scores:
                final_scores = [a + b for a, b in zip(message.old_scores, message.delta_scores)]
            for hule in message.hules:
                seat = int(hule.seat)
                if seat >= 4:
                    continue
                stats[seat]["wins"] += 1
                stats[seat]["tsumo" if hule.zimo else "ron"] += 1
                if not hule.zimo and last_discard is not None and last_discard < 4:
                    stats[last_discard]["dealIns"] += 1
                for fan in hule.fans:
                    yaku = (fan.name or f"Yaku #{fan.id}").strip()
                    if yaku:
                        stats[seat]["yaku"][yaku] += 1
        elif name == "RecordNoTile" and message.scores:
            score_info = message.scores[0]
            if score_info.old_scores and score_info.delta_scores:
                final_scores = [a + b for a, b in zip(score_info.old_scores, score_info.delta_scores)]

    if len(final_scores) != 4:
        raise PaipuError(f"Se esperaban 4 scores finales y se obtuvieron {len(final_scores)}")
    normalized = []
    for seat in stats:
        normalized.append({**seat, "yaku": dict(seat["yaku"].most_common())})
    return ParsedPaipu(
        uuid=uuid,
        final_scores=[int(score) for score in final_scores],
        hands=max((seat["hands"] for seat in stats), default=0),
        seat_stats=normalized,
        sha256=hashlib.sha256(raw).hexdigest(),
    )
