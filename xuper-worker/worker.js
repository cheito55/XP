import { connect } from 'cloudflare:sockets';

/**
 * XuperTv Bridge - Cloudflare Worker v5.0
 *
 * Puente WebSocket ↔ HTTP para GrayJay.
 * Usa la API `connect()` de Cloudflare Workers para establecer
 * conexiones WebSocket reales al portal XuperTv.
 *
 * GrayJay solo puede hacer HTTP, pero el portal usa WebSocket.
 * El Worker abre un WS al portal y devuelve la respuesta como JSON.
 *
 * REPOSITORIO: https://github.com/cheito55/XP
 */

// ============================================================
//  Constants
// ============================================================

const APK_PACKAGE = "com.android.msandroid";
const APK_PACKAGE_ORIG = "com.android.mgstxNF";
const APK_VER = "49902";
const APK_VER_ORIG = "43407";
const SPKG_VER = "49";
const UA = "Ranger/4.9.4-17294ac0";

// Portal WS domain (extraído del HAR de HydraProxy funcional)
const PORTAL_WS_HOST = "s23sdf56.45lc9mx79ab.com";
const SEARCH_WS_HOST = "sgyc.bfj1k2g4v.com";

// CDN & SLB (no necesitan portal, solo auth tokens)
const SLB_HOST = "yuwc.swzablvpm.com";
const EPG_HOSTS = ["rokbd.ysrkwctjg.com", "vgwbm.uwfyobivh.com"];
const NOTICE_HOSTS = ["nxiqj.jgrqyxupl.com", "zxiws.tcgwhnvym.com"];
const AD_HOST = "yvhcn.hxjebagrv.com";
const SUB_HOST = "cxdgdx.zobpngkth.com";

// Crypto keys (del APK)
const API_3DES_KEY = "2b494e53756c664c2f44465245733572";

// In-memory session cache (se pierde con reinicio del worker, es normal)
const SESSIONS = new Map();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-User-Token, X-Portal-Code, X-Device-Id, X-Session-Id",
  "Access-Control-Max-Age": "86400"
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

function err(msg, status) {
  return json({ ok: false, error: msg }, status || 400);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function genId(len) {
  const c = "0123456789abcdef";
  let r = "";
  const n = len || 16;
  for (let i = 0; i < n; i++) r += c[Math.floor(Math.random() * 16)];
  return r;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = SESSIONS.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.created > 3600000) { SESSIONS.delete(sessionId); return null; }
  return s;
}

function createSession(userId, userToken, portalCode, deviceId) {
  const id = genId(24);
  SESSIONS.set(id, {
    created: Date.now(),
    userId: userId || "",
    userToken: userToken || "",
    portalCode: portalCode || "",
    deviceId: deviceId || genId(16)
  });
  // Cleanup old sessions
  if (SESSIONS.size > 50) {
    const now = Date.now();
    for (const [k, v] of SESSIONS) {
      if (now - v.created > 3600000) SESSIONS.delete(k);
    }
  }
  return id;
}

// ============================================================
//  DES / 3DES-ECB
// ============================================================

const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,7,4,13,1,6,12,11,9,5,3,8,4,14,9,15,2,8],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,2,0,14,9,11,7,4,0,5,10,2,15,14,2,1,13,12,8,9,3,6,15,14,3,10,7,12,0,15,6,9,11,4,1,13,5,8]
];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function desPerm(bits, p) {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = bits[p[i] - 1];
  return out;
}
function desRotate(bits, count) {
  const n = bits.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = bits[(i + count) % n];
  return out;
}
function desKeySchedule(keyBytes) {
  const keyBits = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 7; j >= 0; j--) keyBits.push((keyBytes[i] >> j) & 1);
  }
  let C = desPerm(keyBits, DES_PC1).slice(0, 28);
  let D = desPerm(keyBits, DES_PC1).slice(28, 56);
  const subs = [];
  for (let i = 0; i < 16; i++) {
    C = desRotate(C, DES_SHIFTS[i]);
    D = desRotate(D, DES_SHIFTS[i]);
    subs.push(desPerm(C.concat(D), DES_PC2));
  }
  return subs;
}
function desF(r, sub) {
  const e = desPerm(r, DES_E);
  const x = [];
  for (let i = 0; i < 48; i++) x.push(e[i] ^ sub[i]);
  const sboxOut = [];
  for (let i = 0; i < 8; i++) {
    const row = (x[i * 6] << 1) | x[i * 6 + 5];
    const col = (x[i * 6 + 1] << 3) | (x[i * 6 + 2] << 2) | (x[i * 6 + 3] << 1) | x[i * 6 + 4];
    const val = DES_SBOX[i][row * 16 + col];
    for (let j = 3; j >= 0; j--) sboxOut.push((val >> j) & 1);
  }
  return desPerm(sboxOut, DES_P);
}
function desEncryptBlock(block, subs) {
  let bits = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 7; j >= 0; j--) bits.push((block[i] >> j) & 1);
  }
  bits = desPerm(bits, DES_IP);
  let L = bits.slice(0, 32);
  let R = bits.slice(32, 64);
  for (let i = 0; i < 16; i++) {
    const f = desF(R, subs[i]);
    const newR = [];
    for (let j = 0; j < 32; j++) newR.push(L[j] ^ f[j]);
    L = R;
    R = newR;
  }
  const combined = R.concat(L);
  const permuted = desPerm(combined, DES_FP);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = 0;
    for (let j = 0; j < 8; j++) out[i] |= permuted[i * 8 + j] << (7 - j);
  }
  return out;
}
function des3Encrypt(plaintext, keyHex) {
  const keyBytes = [];
  for (let i = 0; i < keyHex.length; i += 2) {
    keyBytes.push(parseInt(keyHex.substr(i, 2), 16));
  }
  const plainBytes = [];
  for (let i = 0; i < plaintext.length; i++) {
    plainBytes.push(plaintext.charCodeAt(i) & 0xff);
  }
  const pad = 8 - (plainBytes.length % 8);
  for (let i = 0; i < pad; i++) plainBytes.push(pad);
  const k1 = keyBytes.slice(0, 8);
  const k2 = keyBytes.slice(8, 16);
  const k3 = keyBytes.slice(16, 24);
  const s1 = desKeySchedule(k1);
  const s2 = desKeySchedule(k2);
  const s3 = desKeySchedule(k3);
  const result = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i += 8) {
    const block = plainBytes.slice(i, i + 8);
    const e1 = desEncryptBlock(block, s1);
    const d2 = desEncryptBlock(e1, s2);
    const e3 = desEncryptBlock(d2, s3);
    result.set(e3, i);
  }
  return Array.from(result).map(b => ("0" + b.toString(16)).slice(-2)).join("");
}

// ============================================================
//  WebSocket Portal Bridge
//  Usa cloudflare:sockets connect() para abrir WS al portal.
//  Protocolo WebSocket completo: handshake, frames, ping/pong, buffering.
// ============================================================

/**
 * Parse a single WebSocket frame from a buffer.
 * Returns { opcode, payload, length, usedBytes } or null if incomplete.
 * Handles unmasked server frames, text/binary/ping/pong/close, and fragmentation.
 */
function parseWsFrame(buf) {
  if (buf.byteLength < 2) return null;

  const b = new Uint8Array(buf);
  const fin = (b[0] & 0x80) !== 0;
  const opcode = b[0] & 0x0f;
  let payloadLen = b[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (b.byteLength < 4) return null;
    payloadLen = (b[2] << 8) | b[3];
    offset = 4;
  } else if (payloadLen === 127) {
    if (b.byteLength < 10) return null;
    payloadLen = 0;
    for (let i = 0; i < 8; i++) payloadLen = (payloadLen << 8) | b[2 + i];
    offset = 10;
  }

  // Server frames should NOT be masked, but check mask bit
  const masked = (b[1] & 0x80) !== 0;
  if (masked) offset += 4;

  const totalLen = offset + payloadLen;
  if (b.byteLength < totalLen) return null; // incomplete

  let payload = null;
  if (payloadLen > 0) {
    payload = new Uint8Array(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = masked ? b[offset + i] ^ b[(offset + 4) + i] : b[offset + i];
    }
  }

  return { opcode, payload: payload || new Uint8Array(0), length: payloadLen, usedBytes: totalLen, fin };
}

/**
 * Build a masked WebSocket frame (client → server).
 */
function buildWsFrame(data, opcode) {
  opcode = opcode || 0x01; // text
  const payload = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const mask = new Uint8Array(4);
  for (let i = 0; i < 4; i++) mask[i] = Math.floor(Math.random() * 256);

  let header;
  let payloadOffset;
  if (payload.byteLength < 126) {
    header = new Uint8Array(6);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | payload.byteLength;
    header.set(mask, 2);
    payloadOffset = 6;
  } else if (payload.byteLength < 65536) {
    header = new Uint8Array(8);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header[2] = (payload.byteLength >> 8) & 0xff;
    header[3] = payload.byteLength & 0xff;
    header.set(mask, 4);
    payloadOffset = 8;
  } else {
    header = new Uint8Array(14);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    let len = payload.byteLength;
    for (let i = 7; i >= 0; i--) header[6 + (7 - i)] = (len >>> (i * 8)) & 0xff;
    header.set(mask, 10);
    payloadOffset = 14;
  }

  const frame = new Uint8Array(payloadOffset + payload.byteLength);
  frame.set(header, 0);
  const maskedPayload = new Uint8Array(payload.byteLength);
  for (let i = 0; i < payload.byteLength; i++) maskedPayload[i] = payload[i] ^ mask[i % 4];
  frame.set(maskedPayload, payloadOffset);
  return frame;
}

/**
 * Connect to an external WebSocket endpoint from the Worker.
 * Uses cloudflare:sockets connect() TCP → manual HTTP Upgrade → WS frames.
 */
async function wsConnect(url, timeout) {
  timeout = timeout || 12000;
  const u = new URL(url);
  const host = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : (u.protocol === "wss:" ? 443 : 80);
  const secure = u.protocol === "wss:";

  const socket = connect(host, {
    port: port,
    secureTransport: secure ? "on" : "off"
  });

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();

  // Build handshake request
  const wsKey = btoa(crypto.randomUUID().replace(/-/g, "").substring(0, 16)) + "==";
  const path = u.pathname + (u.search || "");
  const handshake =
    "GET " + path + " HTTP/1.1\r\n" +
    "Host: " + host + (port !== 80 && port !== 443 ? ":" + port : "") + "\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Key: " + wsKey + "\r\n" +
    "Sec-WebSocket-Version: 13\r\n" +
    "\r\n";

  await writer.write(new TextEncoder().encode(handshake));

  // Read handshake response (may come in chunks)
  const deadline = Date.now() + 5000;
  let respBuffer = "";

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise(r => setTimeout(r, remaining))
    ]);
    if (!result || !result.value) continue;

    respBuffer += decoder.decode(result.value, { stream: true });

    // Check for complete HTTP response headers
    if (respBuffer.includes("\r\n\r\n")) {
      const headerEnd = respBuffer.indexOf("\r\n\r\n");
      const statusLine = respBuffer.split("\r\n")[0];

      if (statusLine.includes("101")) {
        // WebSocket upgrade successful!
        // There may be frame data after the headers
        const afterHeaders = respBuffer.substring(headerEnd + 4);

        return {
          writer,
          reader,
          socket,
          decoder,
          frameBuffer: new Uint8Array(0), // no leftover bytes from handshake
          connected: true,
          host,
          port,
          secure
        };
      } else {
        await socket.close();
        throw new Error("WS upgrade rejected: " + statusLine.substring(0, 200));
      }
    }
  }

  await socket.close();
  throw new Error("WS handshake timeout");
}

/**
 * Read from the socket into the frame buffer until we get a complete frame.
 * Handles ping/pong automatically. Returns the first message frame.
 */
async function readWsFrame(conn, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const remaining = Math.max(100, deadline - Date.now());
    const result = await Promise.race([
      conn.reader.read(),
      new Promise(r => setTimeout(r, remaining))
    ]);

    if (!result || !result.value) continue;

    // Append new data to buffer
    const newBuf = new Uint8Array(conn.frameBuffer.byteLength + result.value.byteLength);
    newBuf.set(conn.frameBuffer, 0);
    newBuf.set(result.value, conn.frameBuffer.byteLength);
    conn.frameBuffer = newBuf;

    // Try to parse frames from the buffer
    while (conn.frameBuffer.byteLength > 0) {
      const frame = parseWsFrame(conn.frameBuffer);
      if (!frame) break; // incomplete

      // Consume bytes from buffer
      const remainingBuf = conn.frameBuffer.slice(frame.usedBytes);
      conn.frameBuffer = remainingBuf;

      // Handle control frames
      if (frame.opcode === 0x08) {
        // Close frame
        return { type: "close", data: null };
      } else if (frame.opcode === 0x09) {
        // Ping → send pong
        try {
          await conn.writer.write(buildWsFrame(frame.payload, 0x0A));
        } catch (_) {}
        continue; // keep reading
      } else if (frame.opcode === 0x0a) {
        // Pong → ignore
        continue;
      } else if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        // Text or binary
        const text = conn.decoder.decode(frame.payload);
        try {
          return { type: "data", data: JSON.parse(text) };
        } catch (_) {
          return { type: "data", data: { raw: text.substring(0, 5000) } };
        }
      } else {
        // Unknown opcode, skip
        continue;
      }
    }
  }

  throw new Error("WS read timeout (" + timeout + "ms)");
}

/**
 * Send a WebSocket text frame (client → server).
 */
async function wsSendFrame(conn, message) {
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  await conn.writer.write(buildWsFrame(payload, 0x01));
}

/**
 * Send a JSON command to a WS endpoint and wait for one response.
 */
async function wsExchange(url, command, timeout) {
  timeout = timeout || 12000;
  const conn = await wsConnect(url, timeout);
  try {
    await wsSendFrame(conn, command);
    const result = await readWsFrame(conn, timeout);
    if (result.type === "close") return { raw: "Connection closed by server" };
    return result.data;
  } finally {
    try { await conn.socket.close(); } catch (_) {}
  }
}

/**
 * Send a WS command to the portal.
 */
async function portalCommand(host, sessionId, command, timeout) {
  const url = "wss://" + host + "/v1/ws/" + sessionId;
  return wsExchange(url, command, timeout);
}

// ============================================================
//  Portal WS API Calls
// ============================================================

async function portalHandshake(host, sessionId, deviceId) {
  const cmd = {
    t: 23,
    b: {
      iP: "1.1.1.1",
      iPv6: "",
      di: btoa(deviceId || "GJDUMGQFGHJ="),
      dL: btoa("nHF1dmV2ZW5hbnQ="),
      uL: "",
      ua: "Mozilla/5.0 (Linux; Android 8.1.0; NL5) AppleWebKit/537.36 Chrome/100.0.4896.79 Mobile Safari/537.36",
      aV: "4.34.7",
      r: null,
      dN: "NF",
      vN: "XupTV v4.34",
      l: "es",
      T: Date.now()
    }
  };
  return portalCommand(host, sessionId, cmd, 20000);
}

// ============================================================
//  Request Handlers
// ============================================================

async function handleHealth() {
  return json({
    ok: true,
    version: "5.0",
    worker: "xuper-bridge",
    portalHost: PORTAL_WS_HOST,
    searchHost: SEARCH_WS_HOST,
    sessions: SESSIONS.size,
    endpoints: [
      "/health", "/auth", "/connect",
      "/api/home", "/api/search", "/api/details",
      "/api/stream", "/api/slb", "/api/play",
      "/api/epg", "/api/notice", "/api/discover"
    ]
  });
}

async function handleAuth(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const userId = body.userId || "";
  const userToken = body.userToken || "";
  const portalCode = body.portalCode || "";
  const deviceId = body.deviceId || genId(16);

  if (!userId && !body.email) {
    return err("Proporciona userId+userToken o revisa la configuracion");
  }

  // Create session
  const sessionId = createSession(userId, userToken, portalCode, deviceId);

  return json({
    ok: true,
    sessionId: sessionId,
    userId: userId,
    userToken: userToken,
    portalCode: portalCode,
    deviceId: deviceId,
    portalHost: PORTAL_WS_HOST,
    searchHost: SEARCH_WS_HOST
  });
}

async function handleConnect(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const host = body.host || PORTAL_WS_HOST;
  const sessionId = body.sessionId || genId(16);
  const command = body.command || body.message || {};

  try {
    const result = await portalCommand(host, sessionId, command, body.timeout || 15000);
    return json({ ok: true, data: result });
  } catch (e) {
    return err("WS bridge failed: " + e.message, 502);
  }
}

async function handlePortalApi(request, apiPath) {
  const sessionId = request.headers.get("X-Session-Id") || "";
  const session = getSession(sessionId);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const userId = session ? session.userId : (body.userId || "");
  const userToken = session ? session.userToken : (body.userToken || "");
  const portalCode = session ? session.portalCode : (body.portalCode || "");
  const deviceId = session ? session.deviceId : (body.deviceId || genId(16));

  if (!userId) return err("No hay sesion. Llama a /auth primero.", 401);

  // Build the portal WS command
  const wsPath = "/v1/ws/" + genId(16);
  const command = {
    t: 1,
    b: {
      api: apiPath,
      userId: userId,
      userToken: userToken,
      portalCode: portalCode,
      deviceId: deviceId,
      data: body
    }
  };

  try {
    const result = await portalCommand(PORTAL_WS_HOST, genId(16), command, 15000);
    return json({ ok: true, data: result });
  } catch (e) {
    // Fallback: try HTTP portal API
    try {
      const httpResult = await tryHttpPortal(apiPath, body, userId, userToken, portalCode);
      if (httpResult) return json({ ok: true, data: httpResult });
    } catch (_) {}
    return err("Portal API failed: " + e.message, 502);
  }
}

// HTTP portal fallback (for when portals respond to HTTP)
async function tryHttpPortal(endpoint, body, userId, userToken, portalCode) {
  body.userId = userId;
  body.userToken = userToken;
  body.portalCode = portalCode;

  // Try all known portal hosts
  const httpPortals = [
    "s23sdf56.45lc9mx79ab.com",
    "eaeylu.bvsvfb8c.com",
    "ncneqo.trlgjh4znk.com"
  ];

  for (const host of httpPortals) {
    try {
      const url = "https://" + host + "/api/portalCore/" + endpoint;
      const bodyStr = JSON.stringify(body);
      const payload = "0x" + des3Encrypt(bodyStr, API_3DES_KEY);

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": UA },
        body: payload,
        signal: AbortSignal.timeout(8000)
      });

      const text = await resp.text();
      const data = safeJson(text);
      if (data && !data.returnCode) return data;
    } catch (_) { continue; }
  }
  return null;
}

async function handleSearch(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const query = body.query || body.keyword || body.key || "";
  const page = body.page || 1;
  const sessionId = request.headers.get("X-Session-Id") || "";
  const session = getSession(sessionId);

  // Try WS search via search domain
  const cmd = {
    t: 1,
    b: {
      keyword: query,
      pageIndex: page,
      pageSize: 30
    }
  };

  try {
    const result = await portalCommand(SEARCH_WS_HOST, genId(16), cmd, 10000);
    return json({ ok: true, data: result });
  } catch (e) {
    // Fallback: try HTTP portal
    const userId = session ? session.userId : "";
    const userToken = session ? session.userToken : "";
    const portalCode = session ? session.portalCode : "";

    try {
      const httpResult = await tryHttpPortal("v3/searchByName", {
        key: query, pageIndex: page, pageSize: 30
      }, userId, userToken, portalCode);
      if (httpResult) return json({ ok: true, data: httpResult });
    } catch (_) {}

    return err("Search failed: " + e.message, 502);
  }
}

async function handleHome(request) {
  const sessionId = request.headers.get("X-Session-Id") || "";
  const session = getSession(sessionId);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const userId = session ? session.userId : (body.userId || "");
  const userToken = session ? session.userToken : (body.userToken || "");

  // Build home command for WS
  const cmd = {
    t: 1,
    b: {
      api: "getHome",
      userId: userId,
      userToken: userToken,
      portalCode: session ? session.portalCode : ""
    }
  };

  try {
    const result = await portalCommand(PORTAL_WS_HOST, genId(16), cmd, 10000);
    return json({ ok: true, data: result });
  } catch (e) {
    // Fallback: HTTP
    try {
      const httpResult = await tryHttpPortal("getHome", body, userId, userToken, session ? session.portalCode : "");
      if (httpResult) return json({ ok: true, data: httpResult });
    } catch (_) {}
    return err("Home failed: " + e.message, 502);
  }
}

async function handleDetails(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const contentId = body.contentId || body.content_id || body.id || "";
  if (!contentId) return err("contentId requerido");

  const sessionId = request.headers.get("X-Session-Id") || "";
  const session = getSession(sessionId);
  const userId = session ? session.userId : (body.userId || "");
  const userToken = session ? session.userToken : (body.userToken || "");

  const cmd = {
    t: 1,
    b: {
      api: "getItemData",
      contentId: contentId,
      userId: userId,
      userToken: userToken,
      portalCode: session ? session.portalCode : ""
    }
  };

  try {
    const result = await portalCommand(PORTAL_WS_HOST, genId(16), cmd, 10000);
    return json({ ok: true, data: result });
  } catch (e) {
    try {
      const httpResult = await tryHttpPortal("v4/getItemData", body, userId, userToken, session ? session.portalCode : "");
      if (httpResult) return json({ ok: true, data: httpResult });
    } catch (_) {}
    return err("Details failed: " + e.message, 502);
  }
}

async function handleStream(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const auth = body.auth || "";
  const slbUrl = body.slbUrl || "";

  if (!auth && !slbUrl) return err("auth o slbUrl requerido");

  try {
    // Proxy the SLB request through Worker (bypasses CORS, adds headers)
    const url = slbUrl || ("https://" + SLB_HOST + "/slb/v11/vod?auth=" + encodeURIComponent(auth));
    const resp = await fetch(url, {
      headers: {
        "App": APK_PACKAGE,
        "App-Version": APK_VER,
        "User-Agent": UA,
        "Content-Type": "application/octet-stream"
      }
    });
    const text = await resp.text();
    return json({ ok: true, data: text });
  } catch (e) {
    return err("SLB failed: " + e.message, 502);
  }
}

async function handleCdnProxy(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const cdnUrl = body.url || "";
  if (!cdnUrl) return err("url requerida");

  try {
    const resp = await fetch(cdnUrl, {
      headers: {
        "App": APK_PACKAGE,
        "App-Version": APK_VER,
        "User-Agent": UA,
        "Range": body.range || "bytes=0-8388607",
        "Pragma": "akamai-x-cache-on",
        "X-Buffer": "0",
        "Connection": "Keep-Alive",
        "App": APK_PACKAGE,
        "Ranger-Id": body.rangerId || "",
        "Content-License": body.contentLicense || ""
      },
      redirect: "follow"
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "video/mp2t",
        "Content-Length": resp.headers.get("Content-Length") || "",
        ...CORS_HEADERS
      }
    });
  } catch (e) {
    return err("CDN proxy failed: " + e.message, 502);
  }
}

async function handleEpg() {
  for (const host of EPG_HOSTS) {
    try {
      const resp = await fetch("https://" + host + "/epg/v2/live/app/utc-3/26", {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000)
      });
      const text = await resp.text();
      const data = safeJson(text);
      if (data && typeof data !== "string") return json(data);
    } catch (_) { continue; }
  }
  return err("EPG no disponible", 502);
}

async function handleNotice() {
  for (const host of NOTICE_HOSTS) {
    try {
      const resp = await fetch("https://" + host + "/notice/api/get_notice?pkg=" + APK_PACKAGE_ORIG + "&v=" + APK_VER_ORIG + "&sn=&userId=&language=es", {
        signal: AbortSignal.timeout(8000)
      });
      const text = await resp.text();
      const data = safeJson(text);
      if (data && data.status === 0) return json(data);
    } catch (_) { continue; }
  }
  return json({ status: 0, inner: [] });
}

async function handleDiscover() {
  // Try DCS discovery (may fail if seeds are dead)
  // List all known domains from PCAPdroid
  const knownDomains = [
    PORTAL_WS_HOST,
    SEARCH_WS_HOST,
    "eaeylu.bvsvfb8c.com",
    "ncneqo.trlgjh4znk.com",
    "arwk.5d8u4ypm9k.com",
    "deuw.hetvomaug.com",
    "eijbs.gn5h3hxar2k.com"
  ];

  // Quick DNS check
  const results = [];
  for (const host of knownDomains) {
    try {
      const resp = await fetch("https://" + host + "/health", {
        signal: AbortSignal.timeout(3000)
      });
      results.push({ host, status: resp.status, ok: resp.ok });
    } catch (e) {
      results.push({ host, status: "error", error: e.message });
    }
  }

  return json({ ok: true, results });
}

// ============================================================
//  Router
// ============================================================

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/" || path === "/health") return handleHealth();
      if (path === "/auth" && request.method === "POST") return handleAuth(request);
      if (path === "/connect" && request.method === "POST") return handleConnect(request);
      if (path === "/api/home" && request.method === "POST") return handleHome(request);
      if (path === "/api/search" && request.method === "POST") return handleSearch(request);
      if (path === "/api/details" && request.method === "POST") return handleDetails(request);
      if (path === "/api/stream" && request.method === "POST") return handleStream(request);
      if (path === "/api/cdn" && request.method === "POST") return handleCdnProxy(request);
      if (path === "/api/epg") return handleEpg();
      if (path === "/api/notice") return handleNotice();
      if (path === "/api/discover") return handleDiscover();

      return err("Endpoint no encontrado: " + path + ". Consulta /health", 404);
    } catch (e) {
      return err("Error interno: " + e.message, 500);
    }
  }
};
