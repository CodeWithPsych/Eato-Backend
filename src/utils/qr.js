import { QR_VERSION } from "../constants.js";

/**
 * Build the structured payload that gets embedded in a QR code.
 *
 * @param {object} opts
 * @param {string} opts.restaurantId  - MongoDB ObjectId string
 * @param {number} opts.tableNumber
 * @param {string} opts.token         - 32-char hex token stored in restaurant.tables[].qrToken
 * @param {object} [opts.wifi]        - optional WiFi config
 * @param {string} opts.wifi.ssid
 * @param {string} opts.wifi.password
 * @param {string} [opts.wifi.type]   - "WPA" (default) | "WEP" | "nopass"
 * @returns {string} base64url-encoded string — use this as the QR code content
 */
export function encodeQrPayload({ restaurantId, tableNumber, token, wifi }) {
  const payload = {
    v: QR_VERSION,
    rid: restaurantId,
    t: tableNumber,
    tok: token,
  };

  if (wifi?.ssid) {
    payload.wifi = {
      ssid: wifi.ssid,
      password: wifi.password ?? "",
      type: wifi.type ?? "WPA",
    };
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decode and validate a raw QR string that arrived from the mobile scanner.
 *
 * @param {string} raw  - the string read by the camera (base64url or plain hex for legacy support)
 * @returns {{ restaurantId, tableNumber, token, wifi? }} decoded fields
 * @throws {Error} with a human-readable message if the payload is invalid
 */
export function decodeQrPayload(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("QR payload is empty");
  }

  const trimmed = raw.trim();

  // ── Attempt structured base64url decode ───────────────────
  try {
    const json = Buffer.from(trimmed, "base64url").toString("utf8");
    const obj = JSON.parse(json);

    if (!obj.rid || !obj.tok || !obj.t) {
      throw new Error("QR payload missing required fields (rid, tok, t)");
    }

    return {
      restaurantId: obj.rid,
      tableNumber: Number(obj.t),
      token: obj.tok,
      wifi: obj.wifi ?? null,
      version: obj.v ?? "unknown",
    };
  } catch (structuredErr) {
    // If it's a JSON/base64 parse error, try legacy plain-hex fallback
    // (tokens generated before this QR version were just 32-char hex strings)
    if (/^[0-9a-f]{32}$/i.test(trimmed)) {
      return {
        restaurantId: null,   // caller must look up by token
        tableNumber: null,
        token: trimmed,
        wifi: null,
        version: "legacy",
        isLegacy: true,
      };
    }

    throw new Error(`Malformed QR payload: ${structuredErr.message}`);
  }
}

/**
 * Generate the WiFi connection string in the standard WifiNetwork URI format.
 * Most Android and iOS camera apps understand this format and offer to connect.
 *
 * Format: WIFI:T:<type>;S:<ssid>;P:<password>;;
 *
 * @param {object} wifi
 * @returns {string}
 */
export function wifiConnectionString({ ssid, password, type = "WPA" }) {
  // Escape special chars in ssid / password for the WIFI URI format
  const escape = (s) => String(s ?? "").replace(/[\\;,"]/g, (c) => `\\${c}`);
  return `WIFI:T:${type};S:${escape(ssid)};P:${escape(password)};;`;
}