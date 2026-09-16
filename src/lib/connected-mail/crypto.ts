import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const randomSecret = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const validSecret = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

/** AES-256-GCM binds ciphertext to its application/owner/purpose. Keep key outside the database. */
export function tokenVault(keyHex: string) {
  if (!/^[a-f\d]{64}$/i.test(keyHex)) throw new Error("Invalid mail encryption key");
  const key = Buffer.from(keyHex, "hex");
  return {
    seal(value: unknown, context: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
    },
    open<T>(value: string, context: string): T {
      const [version, iv, tag, encrypted, extra] = value.split(".");
      if (version !== "v1" || !iv || !tag || !encrypted || extra) throw new Error("Invalid encrypted mail token");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as T;
    },
  };
}
