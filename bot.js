// =============================================
// Minecraft Bedrock AFK Bot — Render Edition
// Compatible with Experimental Features / Beta APIs
// =============================================

const bedrock = require('bedrock-protocol');
const http = require('http');

// ⚙️ SETTINGS — i-verify ang port sa Aternos kapag nag-start ka!
const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324,                   
  username: 'welcome',            
  reconnectDelay: 12000, // 12 seconds para iwas server IP block
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
let keepAliveInterval = null;

function connect() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  console.log(`\n🤖 Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);

  try {
    client = bedrock.createClient({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      offline: true,
      skipPing: true, // Iwas error sa experimental packet responses
      viewDistance: 2, // Mababang view distance para mabilis mag-load ang bot
    });

    client.on('start_game', () => {
      console.log('🎮 Game loaded! Sending readiness packet...');
      // Magsend ng initialization para malaman ng Aternos script engine na tao ang pumasok
      client.queue('set_local_player_as_initialized', { runtime_entity_id: client.entityId });
    });

    client.on('spawn', () => {
      console.log('✅ Bot is IN the server! Server will stay online.');

      // Anti-AFK loop: Paggawa ng konting galaw/rotation para hindi ma-kick
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      
      let tick = 0;
      keepAliveInterval = setInterval(() => {
        try {
          tick++;
          // Nagse-send ng auth input packet sa server (jump/look)
          client.queue('player_auth_input', {
            pitch: 0,
            yaw: (tick * 10) % 360,
            position: { x: 0, y: 0, z: 0 },
            move_vector: { x: 0, z: 0 },
            head_yaw: (tick * 10) % 360,
            input_data: { jump: tick % 2 === 0 },
            input_mode: 'touch',
            play_mode: 'normal',
            interaction_model: 'touch',
            gaze_direction: { x: 0, y: 0, z: 0 },
            tick: BigInt(tick),
            delta: { x: 0, y: 0, z: 0 }
          });
        } catch (e) {
          // Ignore transient packet queue errors
        }
      }, 3000);
    });

    client.on('disconnect', (packet) => {
      console.log(`⚠️ Disconnected: ${packet?.reason || JSON.stringify(packet) || 'Unknown reason'}`);
      cleanupAndReconnect();
    });

    client.on('error', (err) => {
      console.log(`❌ Network Error: ${err.message || err}`);
      cleanupAndReconnect();
    });

  } catch (err) {
    console.log(`❌ Setup Error: ${err.message}`);
    cleanupAndReconnect();
  }
}

function cleanupAndReconnect() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  if (reconnectTimer) return;

  console.log(`🔄 Reconnecting in ${CONFIG.reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, CONFIG.reconnectDelay);
}

console.log('╔══════════════════════════════════════╗');
console.log('║   Minecraft Bedrock AFK Bot          ║');
console.log('║   Render & Experimental Compatible   ║');
console.log('╚══════════════════════════════════════╝');

connect();
