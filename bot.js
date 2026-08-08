// =============================================
// Minecraft Bedrock AFK Bot — RakNet Ping Edition
// =============================================

const { Client } = require('@jsprismarine/raknet');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324, // SIKURADUHIN NA TAMA ITO SA ATERNOS DASHBOARD!
  interval: 5000,
};

// ── HTTP server para sa Render Web Service ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Aternos Keep-Alive Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Web service listening on port ${PORT}`);
});

// ── Continuous Ping Loop ──
async function pingServer() {
  try {
    const client = new Client(CONFIG.host, CONFIG.port);
    const response = await client.ping();
    console.log(`[${new Date().toLocaleTimeString()}] 🟢 Ping success! Server info:`, response?.serverName || 'Online');
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString()}] 🔴 Ping failed (${CONFIG.host}:${CONFIG.port}): ${err.message || 'Timeout / Unreachable'}`);
  }
}

setInterval(pingServer, CONFIG.interval);
pingServer();
