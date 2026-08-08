// =============================================
// Minecraft Bedrock AFK Bot — Render Edition
// =============================================

const bedrock = require('bedrock-protocol');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324,                   
  username: 'welcome',            
  reconnectDelay: 12000,
};

// ── HTTP server para sa Render Web Service ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AFK Bot active!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

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
      skipPing: false, // Hayaan ang bot na basahin ang exact protocol ng Aternos
    });

    client.on('start_game', () => {
      console.log('🎮 Connected! Initializing...');
      client.queue('set_local_player_as_initialized', { runtime_entity_id: client.entityId });
    });

    client.on('spawn', () => {
      console.log('✅ Bot is IN the server!');

      if (keepAliveInterval) clearInterval(keepAliveInterval);
      
      let tick = 0;
      keepAliveInterval = setInterval(() => {
        try {
          tick++;
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
        } catch (e) {}
      }, 3000);
    });

    client.on('disconnect', (packet) => {
      console.log(`⚠️ Disconnected: ${packet?.reason || JSON.stringify(packet) || 'Unknown'}`);
      cleanupAndReconnect();
    });

    client.on('error', (err) => {
      console.log(`❌ Error: ${err.message || err}`);
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

connect();
