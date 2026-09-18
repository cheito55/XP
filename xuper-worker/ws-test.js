/**
 * WS Protocol Tester - Cloudflare Workers approach
 */
import { connect } from 'cloudflare:sockets';

// Frame builder for XuperTv custom protocol
function xuperFrame(type, payload) {
  const data = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const header = new Uint8Array([
    type,  // 0x01=text, 0x02=binary
    0x00,
    (data.length >> 8) & 0xFF,
    data.length & 0xFF,
    0x00, 0x00, 0x00, 0x00  // timestamp/nonce?
  ]);
  const frame = new Uint8Array(header.length + data.length);
  frame.set(header); frame.set(data, header.length);
  return frame;
}

function parseWsFrame(data) {
  if (data.length < 2) return null;
  const b0 = data[0];
  const opcode = b0 & 0x0F;
  const fin = (b0 >> 7) & 1;
  const masked = (data[1] >> 7) & 1;
  let payloadLen = data[1] & 0x7F;
  let offset = 2;
  
  if (payloadLen === 126) {
    payloadLen = (data[2] << 8) | data[3];
    offset = 4;
  } else if (payloadLen === 127) {
    payloadLen = Number(BigInt(data[2]) << 56n | BigInt(data[3]) << 48n | BigInt(data[4]) << 40n | BigInt(data[5]) << 32n | BigInt(data[6]) << 24n | BigInt(data[7]) << 16n | BigInt(data[8]) << 8n | BigInt(data[9]));
    offset = 10;
  }
  
  if (masked) offset += 4;
  
  const payload = data.slice(offset, offset + payloadLen);
  
  // Unmask if needed
  if (masked) {
    const mask = data.slice(offset - 4, offset);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  
  return { opcode, fin, masked, payloadLen, payload, raw: data.slice(0, offset + payloadLen) };
}

async function tryConnect(host, port, path) {
  try {
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    
    // HTTP upgrade
    const wsKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const upgrade = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${wsKey}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://hydra\r\nUser-Agent: Ranger/4.9.4-17294ac0\r\n\r\n`;
    
    await writer.write(new TextEncoder().encode(upgrade));
    
    // Read with timeout
    const { value } = await Promise.race([
      reader.read(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
    ]);
    
    const resp = new TextDecoder().decode(value);
    const isUpgrade = resp.includes("101") || resp.includes("Switching Protocols");
    
    const result = { status: resp.split('\r\n')[0], upgrade: isUpgrade };
    
    if (isUpgrade) {
      // Try sending different payloads
      const payloads = [
        { name: "plain_ping", data: '{"type":"ping"}' },
        { name: "auth_login", data: JSON.stringify({type:"login",userId:"556784760",dev_id:"761cd6edc9681aa5d27dd1e1fa38ae08",pkg:"com.android.msandroid",version:"49902"}) },
        { name: "auth_cmd", data: JSON.stringify({cmd:"auth",uid:"556784760",did:"761cd6edc9681aa5d27dd1e1fa38ae08"}) },
        { name: "ws_binary_01", data: null, binary: true, opcode: 0x01 },
        { name: "ws_binary_02", data: null, binary: true, opcode: 0x02 },
        { name: "custom_01", data: JSON.stringify({type:"login",userId:"556784760"}), customHeader: true },
        { name: "custom_02", data: JSON.stringify({method:"getUserData",params:{}}), customHeader: true },
      ];
      
      for (const p of payloads) {
        try {
          let wsPayload;
          if (p.customHeader) {
            // Custom 8-byte header
            const text = new TextEncoder().encode(p.data);
            const hdr = new Uint8Array(8);
            hdr[0] = 0x01; // type
            hdr[1] = 0x00;
            hdr[2] = (text.length >> 8) & 0xFF;
            hdr[3] = text.length & 0xFF;
            wsPayload = new Uint8Array(8 + text.length);
            wsPayload.set(hdr); wsPayload.set(text, 8);
          } else if (p.binary) {
            wsPayload = new Uint8Array([p.opcode, 0x00, 0x00, 0x01]);
          } else {
            wsPayload = p.data;
          }
          
          // Send as WS binary frame
          const masked = true;
          const mask = crypto.getRandomValues(new Uint8Array(4));
          const raw = typeof wsPayload === 'string' ? new TextEncoder().encode(wsPayload) : wsPayload;
          let header;
          if (raw.length < 126) {
            header = new Uint8Array([0x82, masked ? (0x80 | raw.length) : raw.length]);
          } else {
            header = new Uint8Array([0x82, masked ? 0xFE : 0x7E, (raw.length >> 8) & 0xFF, raw.length & 0xFF]);
          }
          
          const frame = new Uint8Array(header.length + (masked ? 4 : 0) + raw.length);
          frame.set(header);
          let offset = header.length;
          if (masked) { frame.set(mask, offset); offset += 4; }
          if (masked) {
            for (let i = 0; i < raw.length; i++) frame[offset + i] = raw[i] ^ mask[i & 3];
          } else {
            frame.set(raw, offset);
          }
          
          await writer.write(frame);
          
          // Try reading response
          try {
            const { value: resp } = await Promise.race([
              reader.read(),
              new Promise((_, rej) => setTimeout(() => rej(new Error("ws_timeout")), 2000))
            ]);
            const parsed = parseWsFrame(resp);
            result[p.name] = {
              sent: raw.length + " bytes",
              received: resp.length + " bytes",
              opcode: parsed ? parsed.opcode : "?",
              text: parsed ? new TextDecoder().decode(parsed.payload).substring(0, 200) : Array.from(resp).map(b => b.toString(16).padStart(2, '0')).join(' ').substring(0, 200)
            };
          } catch (e) {
            result[p.name] = { sent: raw.length + " bytes", error: e.message };
          }
        } catch (e) {
          result[p.name] = { error: e.message };
        }
      }
    }
    
    await writer.close();
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    
    const results = {};
    const hash = Math.random().toString(16).substr(2, 16);
    
    // Test portal WS
    results.portal = await tryConnect("s23sdf56.45lc9mx79ab.com", 80, `/v1/ws/${hash}`);
    
    // Test search WS
    results.search = await tryConnect("sgyc.bfj1k2g4v.com", 80, "/v1/imagine");
    
    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
