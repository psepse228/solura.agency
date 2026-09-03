// solura-eco/frontend/src/lib/session.ts
//
// Verifies the same base64url(payload).hex(hmac) token format the backend
// issues (app/auth/session.py) -- using Web Crypto (crypto.subtle) so this
// runs in both the Edge runtime (proxy.ts) and Node (the /api/login route
// handler) without a native crypto dependency. Never re-serializes the
// payload to JSON before hashing -- it hashes the raw decoded bytes, which
// is what lets this match Python's HMAC without needing byte-identical
// JSON formatting between the two languages.

const MAX_AGE_SECONDS = 30 * 24 * 3600; // 30 days, matches the backend

export type SessionPayload = {
  member_id: string;
  username: string;
  issued_at: number;
};

function b64urlDecode(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;

  const [payloadB64, sig] = token.split(".");
  let payloadBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(payloadB64);
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    payloadBytes.slice().buffer
  );
  const expectedSig = toHex(expectedSigBuf);

  if (expectedSig.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (Date.now() / 1000 - payload.issued_at > MAX_AGE_SECONDS) return null;

  return payload;
}
