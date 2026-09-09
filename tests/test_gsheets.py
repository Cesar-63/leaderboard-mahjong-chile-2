import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.gsheets import CREDENTIALS_ENV, CREDENTIALS_PATH_ENV, SheetsError, has_credentials, load_service_account


CUENTA = {
    "type": "service_account",
    "client_email": "bot@liga.iam.gserviceaccount.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\nfalsa\n-----END PRIVATE KEY-----\n",
    "token_uri": "https://oauth2.googleapis.com/token",
}


class CredencialesTests(unittest.TestCase):
    """De dónde saca el script la cuenta de servicio de Google."""

    def entorno(self, **valores):
        limpio = {key: "" for key in (CREDENTIALS_ENV, CREDENTIALS_PATH_ENV)}
        return patch.dict(os.environ, {**limpio, **valores})

    def test_json_en_la_variable(self):
        with self.entorno(**{CREDENTIALS_ENV: json.dumps(CUENTA)}):
            self.assertTrue(has_credentials())
            self.assertEqual(load_service_account()["client_email"], CUENTA["client_email"])

    def test_ruta_en_la_variable(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "cuenta.json"
            ruta.write_text(json.dumps(CUENTA), encoding="utf-8")
            with self.entorno(**{CREDENTIALS_PATH_ENV: str(ruta)}):
                self.assertEqual(load_service_account()["client_email"], CUENTA["client_email"])
            with self.entorno():
                # --credentials manda sobre el entorno.
                self.assertEqual(load_service_account(ruta)["client_email"], CUENTA["client_email"])

    def test_sin_credenciales_avisa_que_variable_falta(self):
        with self.entorno():
            self.assertFalse(has_credentials())
            with self.assertRaises(SheetsError) as caso:
                load_service_account()
        self.assertIn(CREDENTIALS_ENV, str(caso.exception))

    def test_json_incompleto_no_pasa_por_cuenta_de_servicio(self):
        with self.entorno(**{CREDENTIALS_ENV: json.dumps({"client_email": "x@y.z"})}):
            with self.assertRaises(SheetsError) as caso:
                load_service_account()
        self.assertIn("private_key", str(caso.exception))

    def test_json_roto_lo_dice(self):
        with self.entorno(**{CREDENTIALS_ENV: "{no es json"}):
            with self.assertRaises(SheetsError) as caso:
                load_service_account()
        self.assertIn("JSON", str(caso.exception))


if __name__ == "__main__":
    unittest.main()
