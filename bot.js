// =============================================
// Minecraft Bedrock AFK Bot — Render Edition
// (Auto version-detect + better logging)
// =============================================

const bedrock = require('bedrock-protocol');
const http = require('http');

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324, // Siguraduhing tama ang Port sa Aternos dashboard habang online!
  username: 'welcome',
  reconnectDelay: 10000,
  pingTimeout: 15000,
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

// Kinukuha ang listahan ng versions na SUPORTADO ng naka-install na
// bedrock-protocol library (base sa package.json / node_modules mo).
// Ginagamit ito kapag hindi supported ang exact detected version,
// para pumili ng pinakamalapit/pinakabagong supported version
// sa halip na basta mag-crash.
function getSupportedVersions() {
  try {
    // Ito yung internal data file na ginagamit mismo ng bedrock-protocol
    // para i-validate ang mga version (option.js dependency).
    const options = require('bedrock-protocol/src/options.js');
    if (options && options.Versions) return Object.keys(options.Versions);
  } catch (e) {}

  try {
    const versions = require('bedrock-protocol/data/versions.json');
    if (Array.isArray(versions)) return versions;
    if (versions && typeof versions === 'object') return Object.keys(versions);
  } catch (e) {}

  return null;
}

function pickBestVersion(detectedVersion) {
  const supported = getSupportedVersions();
  if (!supported || supported.length === 0) return detectedVersion;

  if (supported.includes(detectedVersion)) {
    return detectedVersion;
  }

  console.log(`⚠️ Version ${detectedVersion} ay hindi supported ng naka-install na library.`);
  console.log(`📦 Supported versions ngayon: ${supported.join(', ')}`);

  // Piliin ang pinakabagong (last) supported version bilang fallback,
  // dahil kadalasan pasulong lang ang compatibility ng Bedrock protocol.
  const fallback = supported[supported.length - 1];
  console.log(`🔧 Gagamitin na lang ang pinakabagong supported version: ${fallback}`);
  return fallback;
}

// Ini-ping muna ang server para malaman ang EXACT Bedrock version
// na kasalukuyang running, kaya hindi na kailangan i-hardcode/i-edit
// manually tuwing nag-a-auto-update ang Aternos server version.
async function detectServerVersion() {
  try {
    console.log(`📡 Pinging ${CONFIG.host}:${CONFIG.port} para malaman ang server version...`);
    const res = await bedrock.ping({
      host: CONFIG.host,
      port: CONFIG.port,
      timeout: CONFIG.pingTimeout,
    });

    console.log(`📋 Ping response:`, JSON.stringify(res, null, 2));

    if (res && res.version) {
      console.log(`✅ Nakuha ang server version: ${res.version}`);
      return res.version;
    }

    console.log('⚠️ Walang version field sa ping response, gagamitin ang fallback.');
    return null;
  } catch (err) {
    console.log(`❌ Ping failed: ${err.message || err}`);
    return null;
  }
}

async function connect() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  // I-detect muna ang tamang version bago kumonekta.
  const detectedVersion = await detectServerVersion();
  const versionToUse = detectedVersion ? pickBestVersion(detectedVersion) : null;

  console.log(`\n🤖 Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);
  if (versionToUse) {
    console.log(`🔧 Gagamitin ang version: ${versionToUse}`);
  } else {
    console.log('🔧 Walang na-detect na version — gagamitin ang default ng library (posibleng mag-mismatch).');
  }

  const clientOptions = {
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    offline: true,
    skipPing: false,        // Kinakailangan para sa tamang UDP handshake
    connectTimeout: 20000,  // Nagbibigay ng oras kapag mabagal mag-respond ang Aternos
    concurrency: 1,
  };

  // I-set lang ang version kapag successfully na-detect,
  // para hindi mag-crash kung walang laman.
  if (versionToUse) {
    clientOptions.version = versionToUse;
  }

  try {
    client = bedrock.createClient(clientOptions);
  } catch (err) {
    console.log(`❌ createClient failed: ${err.message || err}`);
    console.log('👉 Malamang kailangan i-update ang bedrock-protocol package sa package.json mo.');
    scheduleReconnect();
    return;
  }

  client.on('start_game', () => {
    console.log('🎮 Game state received! Joining world...');
    try {
      client.queue('set_local_player_as_initialized', { runtime_entity_id: client.entityId });
    } catch (e) {
      console.log('❌ Failed to send set_local_player_as_initialized:', e.message);
    }
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
    console.log('⚠️ Disconnected. Full packet:', JSON.stringify(packet, null, 2));
    scheduleReconnect();
  });

  client.on('kick', (packet) => {
    console.log('⚠️ Kicked. Full packet:', JSON.stringify(packet, null, 2));
    scheduleReconnect();
  });

  client.on('error', (err) => {
    console.log(`❌ Error: ${err.message || err}`);
    if (err.stack) console.log(err.stack);
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
