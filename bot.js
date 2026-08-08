// =============================================
// Minecraft Bedrock AFK Bot — Mineflayer Edition
// =============================================

const mineflayer = require('mineflayer');
const bedrock = require('mineflayer-bedrock');
const http = require('http');

// Inject Bedrock protocol support sa Mineflayer
bedrock(mineflayer);

const CONFIG = {
  host: '12-valencia.aternos.me',
  port: 30324,
  username: 'welcome',
  reconnectDelay: 10000,
};

// ── HTTP server para sa Render ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mineflayer AFK Bot is running! Web service active.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Web service listening on port ${PORT}`);
});

let bot = null;
let reconnectTimer = null;

function createBot() {
  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  console.log(`\n🤖 Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    type: 'bedrock',
    offline: true,
  });

  bot.on('spawn', () => {
    console.log('✅ Bot has spawned IN the server! Server will stay online.');

    // Jump action bawat 4 na segundo para iwas idle kick
    const jumpInterval = setInterval(() => {
      if (bot) {
        try {
          bot.setControlState('jump', true);
          setTimeout(() => {
            if (bot) bot.setControlState('jump', false);
          }, 400);
        } catch (e) {}
      }
    }, 4000);

    bot.on('end', () => {
      clearInterval(jumpInterval);
    });
  });

  bot.on('end', (reason) => {
    console.log(`⚠️ Disconnected: ${reason || 'Unknown reason'}`);
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.log(`❌ Error: ${err.message || err}`);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`🔄 Reconnecting in ${CONFIG.reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, CONFIG.reconnectDelay);
}

console.log('╔══════════════════════════════════════╗');
console.log('║   Mineflayer Bedrock AFK Bot         ║');
console.log('╚══════════════════════════════════════╝');

createBot();
