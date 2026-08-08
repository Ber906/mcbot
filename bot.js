// =============================================
// Minecraft Bedrock AFK Bot — Pure UDP Keep-Alive
// =============================================

const dgram = require('dgram');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324, // Siguraduhing ito ang Port sa Aternos habang ONLINE ang server
  interval: 5000, // Nagpapadala ng ping bawat 5 segundo
};

// RakNet Unconnected Ping Packet Buffer
const UNCONNECTED_PING = Buffer.from([
  0x01,                                           // ID_UNCONNECTED_PING
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Time
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, // Offline Message Data ID
  0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// ── HTTP server para hindi mag-sleep ang Render ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Aternos Keep-Alive Bot is running! Web service active.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Web service listening on port ${PORT}`);
});

// ── Direct UDP RakNet Ping ──
function pingServer() {
  const socket = dgram.createSocket('udp4');

  socket.send(UNCONNECTED_PING, 0, UNCONNECTED_PING.length, CONFIG.port, CONFIG.host, (err) => {
    if (err) {
      console.log(`[${new Date().toLocaleTimeString()}] 🔴 UDP Error: ${err.message}`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] 🟢 Ping packet sent to ${CONFIG.host}:${CONFIG.port} — Aternos active!`);
    }
    socket.close();
  });
}

setInterval(pingServer, CONFIG.interval);
pingServer();
