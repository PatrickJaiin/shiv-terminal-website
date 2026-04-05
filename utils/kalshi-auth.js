import crypto from "crypto";

/**
 * Sign a Kalshi API request using RSA-PSS (SHA-256).
 * Returns headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE
 */
function normalizePem(raw) {
  let key = raw.trim();
  // Detect header type
  const headers = [
    { h: "-----BEGIN PRIVATE KEY-----", f: "-----END PRIVATE KEY-----" },
    { h: "-----BEGIN RSA PRIVATE KEY-----", f: "-----END RSA PRIVATE KEY-----" },
  ];
  for (const { h, f } of headers) {
    if (key.includes(h)) {
      const body = key.replace(h, "").replace(f, "").replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) || [];
      return [h, ...lines, f].join("\n");
    }
  }
  return key;
}

function parseKey(rawPem) {
  const pem = normalizePem(rawPem);
  // createPrivateKey handles both PKCS#1 (RSA PRIVATE KEY) and PKCS#8 (PRIVATE KEY)
  return crypto.createPrivateKey(pem);
}

function signRequest(keyId, privateKeyPem, method, path) {
  const timestampMs = Date.now().toString();
  const message = `${timestampMs}${method.toUpperCase()}${path}`;
  const key = parseKey(privateKeyPem);
  const signature = crypto.sign("sha256", Buffer.from(message), {
    key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64");
  return {
    "KALSHI-ACCESS-KEY": keyId,
    "KALSHI-ACCESS-TIMESTAMP": timestampMs,
    "KALSHI-ACCESS-SIGNATURE": signature,
  };
}

/**
 * Fetch wrapper that adds Kalshi API key auth headers.
 * `url` must be the full URL; query params are stripped for signing.
 */
export async function kalshiFetch(url, { keyId, privateKey, method = "GET", body, headers = {} } = {}) {
  const urlObj = new URL(url);
  const path = urlObj.pathname; // sign path only, no query string
  const authHeaders = signRequest(keyId, privateKey, method, path);
  return fetch(url, {
    method,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
