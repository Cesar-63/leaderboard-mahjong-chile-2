# Integración Google Sheets → Liga Mahjong Chile

La planilla configurada en `sync-config.json` es el panel administrativo. Los
organizadores pegan los enlaces de repetición en la hoja **Calendario**, en la
celda vacía ubicada a la derecha de `Paipu G1` o `Paipu G2`.

## Ejecutar localmente

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/sync.py
```

Para probar con una copia local de la planilla:

```bash
python scripts/sync.py --xlsx planilla.xlsx --offline
```

El modo `--offline` no realiza descargas. Los logs previamente descargados se
leen desde `data/raw-paipu/` y nunca se versionan.

## Archivos generados

- `data/liga.json`: contrato completo consumido por la interfaz.
- `data/stats.json`: métricas avanzadas derivadas exclusivamente de paipus.
- `data/sync-status.json`: estado y error de las 168 celdas posibles.
- `data/generated.js`: versión cargable por la aplicación estática actual.

El frontend conserva `data.js` como fallback de desarrollo. Cuando existe
`data/generated.js`, los datos sincronizados reemplazan el mock.

## Autoridad de datos

- `Game History A/B` manda para standings y puntos.
- Los paipus deben coincidir exactamente con sus cuatro jugadores y scores.
- El paipu alimenta estadísticas avanzadas y agrega un enlace verificable al
  historial.
- Un paipu con error no reemplaza un resultado oficial válido.

## Estados

- `PENDIENTE`: la celda no contiene un paipu.
- `VALIDADO`: el paipu se decodificó, pero falta el resultado en Game History.
- `PUBLICADO`: el paipu coincide con Game History.
- `ERROR`: URL, descarga, fixture o resultado inconsistente.
- `REQUIERE_AUTH`: el enlace es válido, pero Mahjong Soul exige una sesión
  técnica para entregar el protobuf. El resultado oficial igual se publica.

## Automatización

`.github/workflows/sync-data.yml` ejecuta la sincronización cada 15 minutos y
también permite iniciarla manualmente desde GitHub Actions. Si los datos cambian,
el workflow hace un commit; Vercel puede desplegar ese commit normalmente.

La planilla debe continuar siendo legible mediante el enlace compartido. No se
requieren credenciales de Google mientras se mantenga esa configuración.

Los paipus recientes de Mahjong Soul pueden exigir autenticación aun cuando el
enlace de replay sea compartible. En ese caso la tabla y el historial continúan
sincronizándose desde `Game History`; las estadísticas avanzadas quedan como
pendientes hasta configurar una cuenta técnica o colocar el protobuf en
`data/raw-paipu/<uuid>.pb`.

Para Mahjong Soul Global, el workflow usa una sesión técnica de YoStar guardada
exclusivamente en GitHub Actions Secrets:

- `MAJSOUL_UID`
- `MAJSOUL_TOKEN`
- `MAJSOUL_DEVICE_ID`

El sincronizador renueva la sesión mediante `quick-login`, inicia el flujo
OAuth2 de Mahjong Soul y descarga todos los registros en una única conexión.
Los valores nunca se escriben en logs ni en archivos versionados.
