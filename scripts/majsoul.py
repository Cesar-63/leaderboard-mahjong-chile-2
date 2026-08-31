from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import sys
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
MS_GATEWAY_HOSTS = (
    "https://engs.mahjongsoul.com",
    "https://engsbk.mahjongsoul.com",
)
MS_ROUTE_FALLBACKS = (
    ("en-1", "wss://engs.mahjongsoul.com:443/gateway"),
    ("en-2", "wss://engsbk.mahjongsoul.com:443/gateway"),
)
MS_CURRENCY_PLATFORMS = (1, 4, 5, 9, 12)
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


async def _fetch_product_version(session: Any) -> str:
    async with session.get(f"{MS_HOST}/index.html", timeout=20) as response:
        html = await response.text()
    match = re.search(r"productVersion\s*:\s*[\"']([^\"']+)[\"']", html)
    if not match:
        raise PaipuError("No se encontró productVersion en el index.html de Mahjong Soul")
    return match.group(1)


async def _discover_routes(session: Any, product_version: str) -> list[tuple[str, str]]:
    discovered: list[tuple[str, str]] = []
    for gateway in MS_GATEWAY_HOSTS:
        try:
            async with session.get(
                f"{gateway}/api/clientgate/routes",
                params={"platform": "Web", "version": product_version, "lang": "en"},
                timeout=20,
            ) as response:
                payload = await response.json(content_type=None)
            for route in payload.get("data", {}).get("routes", []):
                route_id = str(route.get("id", ""))
                domain = str(route.get("domain", ""))
                if route_id and domain:
                    discovered.append((route_id, f"wss://{domain}/gateway"))
            if discovered:
                break
        except Exception:
            continue
    return list(dict.fromkeys([*discovered, *MS_ROUTE_FALLBACKS]))


async def _open_route(pb: Any, channel_class: Any, route_id: str, endpoint: str) -> Any:
    channel = channel_class(endpoint)
    await channel.connect(MS_HOST)
    try:
        request = pb.ReqRequestConnection(type=1, route_id=route_id, timestamp=int(time.time() * 1000))
        # El proto pineado no declara platform (campo 6); se agrega serializado.
        raw = request.SerializeToString() + b"\x32\x03Web"
        response = pb.ResRequestConnection()
        response.ParseFromString(await channel.send_request(".lq.Route.requestConnection", raw))
        if response.HasField("error") and response.error.code:
            raise PaipuError(f"requestConnection en {route_id} falló ({_rpc_error_detail(response.error)})")
        heartbeat = pb.ResHeartbeat()
        heartbeat.ParseFromString(
            await channel.send_request(".lq.Route.heartbeat", pb.ReqHeartbeat(platform=11).SerializeToString())
        )
        return channel
    except Exception:
        await channel.close()
        raise


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
    downloaded = 0
    async with aiohttp.ClientSession() as http:
        product_version = await _fetch_product_version(http)
        client_version = f"WebGL_2022-{product_version}"
        routes = await _discover_routes(http, product_version)

        # El gateway ahora es un router: sin requestConnection aceptado en la
        # ruta, el lobby rechaza oauth2Auth (código 151).
        channel = None
        connection_errors: list[str] = []
        for route_id, endpoint in routes:
            try:
                channel = await _open_route(pb, MSRPCChannel, route_id, endpoint)
                break
            except Exception as exc:
                connection_errors.append(f"{route_id}: {exc}")
        if channel is None:
            raise PaipuError("No se pudo abrir ninguna ruta de Mahjong Soul (" + "; ".join(connection_errors) + ")")
        lobby = Lobby(channel)
        try:
            auth = pb.ReqOauth2Auth(type=22, code=token, uid=uid, client_version_string=client_version)
            auth_response = await lobby.oauth2_auth(auth)
            if auth_response.HasField("error") and auth_response.error.code:
                stored_detail = _rpc_error_detail(auth_response.error)
                refreshed_token = await _refresh_yostar_token(http, uid, token, device_id)
                auth = pb.ReqOauth2Auth(type=22, code=refreshed_token, uid=uid, client_version_string=client_version)
                auth_response = await lobby.oauth2_auth(auth)
                if auth_response.HasField("error") and auth_response.error.code:
                    raise PaipuAuthRequired(
                        f"oauth2Auth rechazó el token guardado ({stored_detail}) "
                        f"y el token renovado ({_rpc_error_detail(auth_response.error)})"
                    )
            check = pb.ReqOauth2Check(type=22, access_token=auth_response.access_token)
            check_response = await lobby.oauth2_check(check)
            if check_response.HasField("error") and check_response.error.code:
                raise PaipuAuthRequired(f"oauth2Check falló ({_rpc_error_detail(check_response.error)})")

            login = pb.ReqOauth2Login(
                type=22, access_token=auth_response.access_token, reconnect=False,
                random_key=str(uuid_lib.uuid4()), client_version_string=client_version,
                currency_platforms=list(MS_CURRENCY_PLATFORMS), tag="en",
            )
            login.device.platform = "pc"
            login.device.hardware = "pc"
            login.device.os = "Windows"
            login.device.os_version = "Windows 10"
            login.device.is_browser = True
            login.device.software = "Chrome"
            login.device.sale_platform = "web"
            login.client_version.resource = product_version
            login.client_version.package = product_version
            login_response = await lobby.oauth2_login(login)
            if login_response.HasField("error") and login_response.error.code:
                raise PaipuAuthRequired(f"oauth2Login falló ({_rpc_error_detail(login_response.error)})")

            cache_dir.mkdir(parents=True, exist_ok=True)
            failures: list[str] = []
            for _record_id, record_uuid in records:
                destination = cache_dir / f"{record_uuid}.pb"
                if destination.exists() and not destination.read_bytes().lstrip().startswith(b"<?xml"):
                    continue
                # game_uuid es el UUID limpio; el sufijo _a<cuenta> del enlace
                # compartido es solo el ancla de vista y el servidor lo rechaza (1203).
                request = pb.ReqGameRecord(game_uuid=record_uuid, client_version_string=client_version)
                try:
                    response = await lobby.fetch_game_record(request)
                    if response.HasField("error") and response.error.code:
                        await lobby.read_game_record(request)
                        response = await lobby.fetch_game_record(request)
                    if response.HasField("error") and response.error.code:
                        raise PaipuError(f"Mahjong Soul rechazó {record_uuid} ({_rpc_error_detail(response.error)})")
                    raw = bytes(response.data)
                    if not raw and response.data_url:
                        url_request = urllib.request.Request(
                            response.data_url,
                            headers={"User-Agent": "LigaMahjongChile/1.0 (+paipu-importer)"},
                        )
                        with urllib.request.urlopen(url_request, timeout=30) as remote:
                            raw = remote.read()
                    if not raw:
                        raise PaipuError(f"Mahjong Soul devolvió vacío el paipu {record_uuid}")
                    if raw.lstrip().startswith(b"<?xml"):
                        raise PaipuAuthRequired(
                            f"La sesión técnica devolvió XML en vez del paipu {record_uuid}; "
                            f"el acceso autorizado a este registro sigue fallando"
                        )
                except Exception as exc:
                    failures.append(f"{record_uuid}: {exc}")
                    continue
                destination.write_bytes(raw)
                downloaded += 1
            if failures:
                print(
                    f"AVISO: {len(failures)} paipus no se pudieron descargar con la sesión técnica:\n"
                    + "\n".join(f"- {item}" for item in failures),
                    file=sys.stderr,
                )
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
    return asyncio.run(_fetch_authenticated_records_async(records, cache_dir))


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
        RECORD_URL.format(uuid=uuid),
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
    players: list[dict[str, Any]]
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
        # Formato nuevo: cada GameAction lleva el registro serializado en result.
        payloads = [action.result for action in details.actions if action.result]
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
    seat_identity: dict[int, dict[str, Any]] = {}
    record_game_points: dict[int, int] = {}

    for payload in payloads:
        item = pb.Wrapper()
        item.ParseFromString(payload)
        name = item.name.rsplit(".", 1)[-1]
        message_type = getattr(pb, name, None)
        if message_type is None:
            continue
        message = message_type()
        message.ParseFromString(item.data)

        if name == "RecordGame" and hasattr(message, "accounts"):
            # El inicio del registro declara los 4 jugadores y el resultado final.
            for account in message.accounts:
                if account.seat < 4:
                    seat_identity[int(account.seat)] = {"account_id": int(account.account_id), "nickname": account.nickname}
            for player in message.result.players:
                record_game_points[int(player.seat)] = int(player.total_point)
            if len(record_game_points) == 4:
                final_scores = [record_game_points[seat] for seat in range(4)]
        elif name == "RecordNewRound":
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
    # Identidad por asiento (account_id/nickname/puntaje final) cuando el
    # registro la declara; sirve para asociar cada asiento a su jugador sin
    # depender del orden de la planilla.
    players = []
    for seat in range(4):
        identity = seat_identity.get(seat, {})
        players.append({
            "seat": seat,
            "account_id": identity.get("account_id"),
            "nickname": identity.get("nickname"),
            "point": record_game_points.get(seat),
        })
    return ParsedPaipu(
        uuid=uuid,
        final_scores=[int(score) for score in final_scores],
        hands=max((seat["hands"] for seat in stats), default=0),
        seat_stats=normalized,
        players=players,
        sha256=hashlib.sha256(raw).hexdigest(),
    )
