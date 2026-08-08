// =============================================
// Minecraft Bedrock AFK Bot — Render Edition
// =============================================

const bedrock = require('bedrock-protocol');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324, // Siguraduhing tama ang Port sa Aternos dashboard habang online!
  username: 'welcome',
  reconnectDelay: 10000,
  version: '1.26.33', // Force exact version base sa Aternos log
};

// ── HTTP server para hindi matulog ang Render ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AFK Bot is running! Server is online.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// ──────────────────────────────────────────────
let client = null;
let reconnectTimer = null;

function connect() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  console.log(`\n🤖 Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);

  client = bedrock.createClient({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,       // Naidagdag para sa bersyon
    offline: true,
    skipPing: true,                 // Nilagay sa true para iwas Ping timeout
    connectTimeout: 30000,          // Dinagdagan ang timeout threshold
    concurrency: 1,
  });

  client.on('start_game', () => {
    console.log('🎮 Game state received! Joining world...');
    try {
      client.queue('set_local_player_as_initialized', { runtime_entity_id: client.entityId });
    } catch (e) {}
  });

  client.on('spawn', () => {
    console.log('✅ Bot is IN the server! Server will stay online.');

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
    console.log(`⚠️ Disconnected: ${packet?.message || packet?.reason || JSON.stringify(packet)}`);
    scheduleReconnect();
  });

  client.on('error', (err) => {
    console.log(`❌ Error: ${err.message || err}`);
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
console.log('╚══════════════════════════════════════╝');

connect();
