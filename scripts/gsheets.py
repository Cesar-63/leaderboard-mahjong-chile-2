#!/usr/bin/env python3
"""Escritura en el Google Sheet administrativo con una cuenta de servicio.

Leer la planilla no necesita credenciales: `scripts/sync.py` la baja por el
enlace público de exportación. Escribir sí, y para eso alcanza una cuenta de
servicio de Google Cloud con permiso de **Editor** sobre la planilla (se
comparte con el `client_email` del JSON, igual que con una persona).

El JSON de la cuenta llega por `GOOGLE_SERVICE_ACCOUNT_JSON` (el contenido
completo, que es como se guarda en GitHub Actions Secrets, o una ruta) o por
`GOOGLE_APPLICATION_CREDENTIALS` (ruta, la convención de Google). Nunca se
imprime: de las credenciales solo se muestra el `client_email`, que es lo que
hay que compartir en la planilla.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
SCOPE = "https://www.googleapis.com/auth/spreadsheets"
JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"
TOKEN_LIFETIME_SECONDS = 3600
# Margen para no usar un token que expira mientras vuela la petición.
TOKEN_EXPIRY_MARGIN_SECONDS = 60
CREDENTIALS_ENV = "GOOGLE_SERVICE_ACCOUNT_JSON"
CREDENTIALS_PATH_ENV = "GOOGLE_APPLICATION_CREDENTIALS"
USER_AGENT = "LigaMahjongChile/1.0 (+calendario-paipus)"


class SheetsError(RuntimeError):
    pass


def quote_sheet(name: str) -> str:
    """Nombre de hoja listo para un rango A1.

    Los nombres con espacios ("Game History A") van entre comillas simples o la
    API no los reconoce. Gemelo de `quoteSheet` en `api/_lib/sheets.mjs`: son
    runtimes distintos, la regla es la misma."""
    return "'" + str(name).replace("'", "''") + "'"


def has_credentials() -> bool:
    return bool(os.environ.get(CREDENTIALS_ENV) or os.environ.get(CREDENTIALS_PATH_ENV))


def load_service_account(explicit: Path | None = None) -> dict[str, Any]:
    """Credenciales de la cuenta de servicio, desde archivo o variable."""
    raw: str | None = None
    origin = ""
    if explicit:
        raw, origin = Path(explicit).read_text(encoding="utf-8"), str(explicit)
    else:
        inline = os.environ.get(CREDENTIALS_ENV, "").strip()
        path = os.environ.get(CREDENTIALS_PATH_ENV, "").strip()
        if inline.startswith("{"):
            raw, origin = inline, CREDENTIALS_ENV
        elif inline:
            raw, origin = Path(inline).read_text(encoding="utf-8"), f"{CREDENTIALS_ENV}={inline}"
        elif path:
            raw, origin = Path(path).read_text(encoding="utf-8"), f"{CREDENTIALS_PATH_ENV}={path}"
    if not raw:
        raise SheetsError(
            f"Faltan las credenciales de Google: define {CREDENTIALS_ENV} con el JSON de la "
            f"cuenta de servicio (o {CREDENTIALS_PATH_ENV} con su ruta, o pasa --credentials)"
        )
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SheetsError(f"Las credenciales de Google en {origin} no son un JSON válido: {exc}") from exc
    missing = [key for key in ("client_email", "private_key", "token_uri") if not info.get(key)]
    if missing:
        raise SheetsError(
            f"Las credenciales de Google en {origin} no parecen de una cuenta de servicio: "
            f"falta {', '.join(missing)}"
        )
    return info


class SheetsClient:
    """Cliente mínimo de la API de Sheets: leer y escribir rangos A1."""

    def __init__(self, spreadsheet_id: str, credentials: dict[str, Any]) -> None:
        self.spreadsheet_id = spreadsheet_id
        self.credentials = credentials
        self._token = ""
        self._token_expires = 0.0

    @property
    def account_email(self) -> str:
        return str(self.credentials.get("client_email", ""))

    def _assertion(self) -> str:
        try:
            from google.auth import crypt, jwt
        except ImportError as exc:  # pragma: no cover - depende del entorno
            raise SheetsError(
                "Falta la dependencia google-auth para firmar el token de Google "
                "(pip install -r requirements.txt)"
            ) from exc
        now = int(time.time())
        signer = crypt.RSASigner.from_service_account_info(self.credentials)
        payload = {
            "iss": self.credentials["client_email"],
            "scope": SCOPE,
            "aud": self.credentials["token_uri"],
            "iat": now,
            "exp": now + TOKEN_LIFETIME_SECONDS,
        }
        return jwt.encode(signer, payload).decode("ascii")

    def access_token(self) -> str:
        if self._token and time.time() < self._token_expires - TOKEN_EXPIRY_MARGIN_SECONDS:
            return self._token
        body = urllib.parse.urlencode(
            {"grant_type": JWT_GRANT, "assertion": self._assertion()}
        ).encode("ascii")
        request = urllib.request.Request(
            self.credentials["token_uri"], data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise SheetsError(
                f"Google rechazó la cuenta de servicio {self.account_email} "
                f"(HTTP {exc.code}): {detail}"
            ) from exc
        except Exception as exc:
            raise SheetsError(f"No se pudo pedir el token de Google: {exc}") from exc
        self._token = str(payload.get("access_token", ""))
        if not self._token:
            raise SheetsError("Google no devolvió access_token para la cuenta de servicio")
        self._token_expires = time.time() + float(payload.get("expires_in", TOKEN_LIFETIME_SECONDS))
        return self._token

    def _request(self, method: str, path: str, query: dict[str, Any] | None = None,
                 payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = SHEETS_API.format(spreadsheet_id=self.spreadsheet_id) + path
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {self.access_token()}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        })
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            if exc.code in (401, 403):
                raise SheetsError(
                    f"La cuenta de servicio {self.account_email} no puede escribir en la planilla "
                    f"{self.spreadsheet_id} (HTTP {exc.code}). Compártela con esa dirección como "
                    f"Editor. Detalle: {detail}"
                ) from exc
            raise SheetsError(f"La API de Sheets respondió HTTP {exc.code}: {detail}") from exc
        except Exception as exc:
            raise SheetsError(f"No se pudo hablar con la API de Sheets: {exc}") from exc

    def read_cells(self, ranges: list[str]) -> dict[str, str]:
        """Valor actual de cada rango A1, como texto ('' si la celda está vacía).

        Pide las fórmulas y no el resultado: una celda con `=HYPERLINK(...)`
        tiene que leerse como ocupada, no como vacía.
        """
        if not ranges:
            return {}
        values: dict[str, str] = {}
        # La API acepta muchos rangos por llamada, pero la URL tiene límite:
        # 168 celdas entran de sobra en tandas de 100.
        for start in range(0, len(ranges), 100):
            chunk = ranges[start:start + 100]
            payload = self._request("GET", "/values:batchGet", query={
                "ranges": chunk, "valueRenderOption": "FORMULA",
                "majorDimension": "ROWS",
            })
            for asked, result in zip(chunk, payload.get("valueRanges", [])):
                rows = result.get("values") or [[]]
                first = rows[0] if rows else []
                values[asked] = str(first[0]).strip() if first and first[0] is not None else ""
        return values

    def write_cells(self, updates: dict[str, str]) -> int:
        """Escribe `rango A1 → valor` y devuelve cuántas celdas cambiaron.

        `RAW` deja el texto tal cual: el enlace del paipu se guarda como enlace,
        sin que Sheets lo interprete como fórmula.
        """
        if not updates:
            return 0
        payload = self._request("POST", "/values:batchUpdate", payload={
            "valueInputOption": "RAW",
            "data": [{"range": cell, "values": [[value]]} for cell, value in updates.items()],
        })
        return int(payload.get("totalUpdatedCells", 0))
