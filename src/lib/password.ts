import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export function validPassword(password: string) {
  return password.length >= 12 && password.length <= 128;
}

export async function hashPassword(password: string) {
  if (!validPassword(password)) throw new Error("Password must contain 12–128 characters.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  if (password.length > 128) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, "hex"));
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
