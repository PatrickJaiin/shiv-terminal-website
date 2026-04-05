import crypto from "crypto";

/**
 * Sign a Kalshi API request using RSA-PSS (SHA-256).
 * Returns headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE
 */
function signRequest(keyId, privateKeyPem, method, path) {
  const timestampMs = Date.now().toString();
  const message = `${timestampMs}${method.toUpperCase()}${path}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  const signature = sign.sign(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    "base64"
  );
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
