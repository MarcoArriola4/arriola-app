import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key() {
  const hex = process.env.CREDENTIALS_KEY;
  if (!hex || hex.length !== 64) throw new Error("CREDENTIALS_KEY debe tener 64 caracteres hex");
  return Buffer.from(hex, "hex");
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function descifrar(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
