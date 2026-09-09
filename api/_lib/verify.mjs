// Verificación de la firma de Discord.
//
// Discord firma cada interacción con Ed25519 sobre `timestamp + body` y espera
// un 401 si la firma no valida: si el endpoint acepta cualquier cosa, no pasa
// la verificación del portal y además queda abierto a que un tercero escriba
// en la planilla.
import { createPublicKey, verify } from "node:crypto";

// node:crypto sólo importa claves con envoltura. La clave pública del portal
// viene como 32 bytes en hex, así que se le antepone el prefijo DER de
// SubjectPublicKeyInfo para Ed25519 (OID 1.3.101.112).
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const keyCache = new Map();

function publicKeyFromHex(hex) {
  const cached = keyCache.get(hex);
  if (cached) return cached;
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) {
    throw new Error("DISCORD_PUBLIC_KEY debe ser la clave pública en hex (32 bytes / 64 caracteres)");
  }
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
  keyCache.set(hex, key);
  return key;
}

export function verifyDiscordSignature({ publicKeyHex, signature, timestamp, rawBody }) {
  if (!publicKeyHex || !signature || !timestamp) return false;
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  let key;
  try {
    key = publicKeyFromHex(publicKeyHex);
  } catch {
    return false;
  }
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.from(rawBody, "utf8")]);
  try {
    return verify(null, message, key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
