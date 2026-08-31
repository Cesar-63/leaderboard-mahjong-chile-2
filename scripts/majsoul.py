from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
import urllib.request
import uuid as uuid_lib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PAIPU_RE = re.compile(r"(?P<uuid>\d{6}-[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?P<trailer>_a\d+)?")
RECORD_URL = "https://record-v2.maj-soul.com:5333/majsoul/game_record/{uuid}"
MS_HOST = "https://mahjongsoul.game.yo-star.com"
MS_GATEWAY_FALLBACKS = (
    "wss://engs.mahjongsoul.com/gateway",
    "wss://engsbk.mahjongsoul.com/gateway",
)
YOSTAR_QUICK_LOGIN = "https://en-sdk-api.yostarplat.com/user/quick-login"
YOSTAR_SDK_VERSION = "4.16.0"
YOSTAR_SIGNING_SALT = bytes([
    52, 116, 103, 19, 26, 70, 111, 104, 101, 215,
    242, 102, 46, 56, 132, 31, 190, 42, 219, 35,
]).hex()


class PaipuError(RuntimeError):
    pass


class PaipuAuthRequired(PaipuError):
    pass


def _rpc_error_detail(error: Any) -> str:
    detail = f"código {error.code}"
    if getattr(error, "json_param", ""):
        detail += f", detalle {error.json_param}"
    return detail


def has_yostar_credentials() -> bool:
    return all(os.environ.get(name) for name in (
        "MAJSOUL_UID", "MAJSOUL_TOKEN", "MAJSOUL_DEVICE_ID",
    ))


def _compact_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


async def _refresh_yostar_token(session: Any, uid: str, token: str, device_id: str) -> str:
    head = {
        "Region": "US", "PID": "US-MAJONGSOUL", "Channel": "web",
        "Platform": "pc", "Version": YOSTAR_SDK_VERSION, "Lang": "en",
        "DeviceID": device_id, "Time": int(time.time()), "UID": uid, "Token": token,
    }
    body: dict[str, Any] = {}
    signature = hashlib.md5(
        f"{_compact_json(head)}{_compact_json(body)}{YOSTAR_SIGNING_SALT}".encode()
    ).hexdigest().upper()
    authorization = _compact_json({"Head": head, "Sign": signature})
    async with session.post(
        YOSTAR_QUICK_LOGIN,
        headers={"Authorization": authorization, "Accept": "application/json, text/plain, */*"},
        json=body,
        timeout=20,
    ) as response:
        text = await response.text()
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise PaipuAuthRequired(
                f"YoStar quick-login respondió HTTP {response.status} con {response.content_type or 'contenido desconocido'}"
            ) from exc
    refreshed = payload.get("Data", {}).get("UserInfo", {}).get("Token", "")
    if payload.get("Code") != 200 or not refreshed:
        raise PaipuAuthRequired(
            f"YoStar rechazó la sesión técnica (código {payload.get('Code', 'desconocido')})"
        )
    return str(refreshed)


async def _discover_gateways(session: Any, resource_version: str) -> list[str]:
    discovered: list[str] = []
    try:
        async with session.get(f"{MS_HOST}/v{resource_version}.w/config.json", timeout=20) as response:
            config = await response.json(content_type=None)
        player = next((item for item in config.get("ip", []) if item.get("name") == "player"), {})
        for gateway in player.get("gateways", []):
            url = str(gateway.get("url", "")).rstrip("/")
            if url.startswith("https://"):
                discovered.append(f"wss://{url[8:]}/gateway")
    except Exception:
        pass
    return list(dict.fromkeys([*discovered, *MS_GATEWAY_FALLBACKS]))


async def _fetch_authenticated_records_async(records: list[tuple[str, str]], cache_dir: Path) -> int:
    try:
        import aiohttp
        from ms import protocol_pb2 as pb  # type: ignore
        from ms.base import MSRPCChannel  # type: ignore
        from ms.rpc import Lobby  # type: ignore
    except ImportError as exc:
        raise PaipuError("Faltan dependencias para autenticar con Mahjong Soul") from exc

    uid = os.environ["MAJSOUL_UID"]
    token = os.environ["MAJSOUL_TOKEN"]
    device_id = os.environ["MAJSOUL_DEVICE_ID"]
    async with aiohttp.ClientSession() as http:
        refreshed_token = await _refresh_yostar_token(http, uid, token, device_id)
        async with http.get(f"{MS_HOST}/version.json", timeout=20) as response:
            text = await response.text()
            try:
                version_payload = json.loads(text)
            except json.JSONDecodeError as exc:
                raise PaipuError(
                    f"Mahjong Soul version.json respondió HTTP {response.status} con {response.content_type or 'contenido desconocido'}"
                ) from exc
        resource_version = str(version_payload["version"]).replace(".w", "")
        forced_version = str(version_payload.get("force_version", "")).replace(".w", "")
        gateways = await _discover_gateways(http, resource_version)
    version_candidates = list(dict.fromkeys(
        value for value in (resource_version, forced_version) if value
    ))

    channel = None
    lobby = None
    last_connection_error: Exception | None = None
    for endpoint in gateways:
        candidate = MSRPCChannel(endpoint)
        try:
            await candidate.connect(MS_HOST)
            channel = candidate
            lobby = Lobby(channel)
            break
        except Exception as exc:
            last_connection_error = exc
    if channel is None or lobby is None:
        detail = type(last_connection_error).__name__ if last_connection_error else "sin candidatos"
        raise PaipuError(f"No se pudo conectar a ningún gateway de Mahjong Soul ({detail})")
    downloaded = 0
    try:
        auth_response = None
        selected_version = resource_version
        for candidate_version in version_candidates:
            auth = pb.ReqOauth2Auth(
                type=22, code=refreshed_token, uid=uid,
                client_version_string=f"web-{candidate_version}",
            )
            auth_response = await lobby.oauth2_auth(auth)
            selected_version = candidate_version
            if not (auth_response.HasField("error") and auth_response.error.code == 151):
                break
        assert auth_response is not None
        if auth_response.HasField("error") and auth_response.error.code:
            raise PaipuAuthRequired(f"oauth2Auth falló ({_rpc_error_detail(auth_response.error)})")
        client_version = f"web-{selected_version}"
        check = pb.ReqOauth2Check(type=22, access_token=auth_response.access_token)
        check_response = await lobby.oauth2_check(check)
        if check_response.HasField("error") and check_response.error.code:
            raise PaipuAuthRequired(f"oauth2Check falló ({_rpc_error_detail(check_response.error)})")

        login = pb.ReqOauth2Login(
            type=22, access_token=auth_response.access_token, reconnect=True,
            random_key=str(uuid_lib.uuid4()), client_version_string=client_version,
            gen_access_token=True, version=0, tag="majsoul-hk-client",
        )
        login.device.is_browser = True
        login.device.platform = "pc"
        login.device.os = "mac"
        login.device.software = "Chrome"
        login.client_version.resource = selected_version
        login.currency_platforms.extend([2, 6, 8, 10, 11])
        login_response = await lobby.oauth2_login(login)
        if login_response.HasField("error") and login_response.error.code:
            raise PaipuAuthRequired(f"oauth2Login falló ({_rpc_error_detail(login_response.error)})")

        cache_dir.mkdir(parents=True, exist_ok=True)
        missing = [
            (record_id, record_uuid)
            for record_id, record_uuid in records
            if not (cache_dir / f"{record_uuid}.pb").exists()
            or (cache_dir / f"{record_uuid}.pb").read_bytes().lstrip().startswith(b"<?xml")
        ]
        for index, (record_id, record_uuid) in enumerate(missing):
            request = pb.ReqGameRecord(game_uuid=record_id, client_version_string=client_version)
            response = await lobby.fetch_game_record(request)
            if response.HasField("error") and response.error.code == 151:
                await lobby.read_game_record(request)
                response = await lobby.fetch_game_record(request)
            if response.HasField("error") and response.error.code:
                detail = _rpc_error_detail(response.error)
                raise PaipuAuthRequired(f"La sesión técnica no puede leer {record_uuid} (código {response.error.code}: {detail})")
            raw = bytes(response.data)
            if not raw and response.data_url:
                url_request = urllib.request.Request(
                    response.data_url,
                    headers={"User-Agent": "LigaMahjongChile/1.0 (+paipu-importer)"},
                )
                with urllib.request.urlopen(url_request, timeout=30) as remote:
                    raw = remote.read()
            if not raw:
                raise PaipuAuthRequired(f"Mahjong Soul devolvió vacío el paipu {record_uuid}")
            if raw.lstrip().startswith(b"<?xml"):
                raise PaipuAuthRequired(
                    f"La sesión técnica devolvió XML en vez del paipu {record_uuid}; "
                    f"el acceso autorizado a este registro sigue fallando"
                )
            destination = cache_dir / f"{record_uuid}.pb"
            destination.write_bytes(raw)
            downloaded += 1
            if index == 0 and len(missing) > 1:
                print(f"Sesión técnica validada: {downloaded} registro(s) descargado(s) de {len(missing)} pendientes")
    finally:
        await channel.close()
    return downloaded


def prefetch_authenticated_records(submissions: list[dict[str, Any]], cache_dir: Path) -> int:
    if not has_yostar_credentials():
        return 0
    records = [
        (item["recordId"], item["uuid"])
        for item in submissions if item.get("recordId") and item.get("uuid")
    ]
    if not records:
        return 0
    try:
        return asyncio.run(_fetch_authenticated_records_async(records, cache_dir))
    except Exception as exc:
        print(f"AVISO: la sesión técnica no pudo descargar los paipus ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 0


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
