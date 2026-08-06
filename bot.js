// =============================================
// Minecraft Bedrock AFK Bot — Render Edition
// Para hindi mag-shutdown ang Aternos server
// =============================================

const bedrock = require('bedrock-protocol');
const http = require('http');

// ⚙️ SETTINGS — palitan mo ito!
const CONFIG = {
  host: '12-valencia.aternos.me', // ← address ng server mo sa Aternos
  port: 30324,                    // ← port (tingnan sa Aternos dashboard)
  username: 'server',             // ← pangalan ng bot
  reconnectDelay: 10000,
};

// ── HTTP server para hindi matulog ang Render ──
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('AFK Bot is running! Server is online.');
});
server.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 HTTP server running on port ${process.env.PORT || 3000}`);
});

// ──────────────────────────────────────────────
let reconnectTimer = null;

function connect() {
  console.log(`\n🤖 Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);

  const client = bedrock.createClient({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    offline: true,
  });

  client.on('spawn', () => {
    console.log('✅ Bot is IN the server! Server will stay online.');

    // Jump every 4 seconds para hindi ma-kick sa AFK
    const jumpInterval = setInterval(() => {
      try {
        client.queue('player_action', {
          action: 'jump',
          position: { x: 0, y: 0, z: 0 },
          result_position: { x: 0, y: 0, z: 0 },
          face: 0,
          entity_id: client.entityId,
        });
      } catch (e) {}
    }, 4000);

    client.on('disconnect', () => {
      clearInterval(jumpInterval);
    });
  });

  client.on('disconnect', (packet) => {
    console.log(`⚠️ Disconnected: ${packet?.message || 'unknown'}`);
    scheduleReconnect();
  });

  client.on('error', (err) => {
    console.log(`❌ Error: ${err.message}`);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`🔄 Reconnecting in ${CONFIG.reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, CONFIG.reconnectDelay);
}

console.log('╔══════════════════════════════════════╗');
console.log('║   Minecraft Bedrock AFK Bot          ║');
console.log('║   Keeps your Aternos server online!  ║');
console.log('╚══════════════════════════════════════╝');
connect();
