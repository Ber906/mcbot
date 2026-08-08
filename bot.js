// =============================================
// Minecraft Bedrock AFK Bot — RakNet Ping Edition
// =============================================

const { Client } = require('@jsprismarine/raknet');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324,
  interval: 5000, // Ping bawat 5 segundo
};

// ── HTTP server para hindi mag-sleep ang Render Web Service ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Aternos Keep-Alive Bot is running! Web service active.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Web service listening on port ${PORT}`);
});

// ── Continuous Ping Loop para manatiling gising ang Aternos ──
async function pingServer() {
  try {
    const client = new Client(CONFIG.host, CONFIG.port);
    await client.ping();
    console.log(`[${new Date().toLocaleTimeString()}] 🟢 Ping sent to ${CONFIG.host}:${CONFIG.port} — Server kept alive!`);
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString()}] 🔴 Server unreachable, starting up, or offline.`);
  }
}

setInterval(pingServer, CONFIG.interval);
pingServer();
