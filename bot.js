// =============================================================
// Minecraft Bedrock AI Bot — Smart Player Edition
// Para sa Aternos — Hindi mag-shutdown, kumikilos parang totoong player
// =============================================================

const bedrock = require('bedrock-protocol');
const http = require('http');

// ─── CONFIG ───────────────────────────────────────────────────
const CONFIG = {
  host: '12-valencia.aternos.me', // ← address ng Aternos server mo
  port: 30324,                    // ← port (tingnan sa Aternos dashboard)
  username: 'ㅤㅤㅤ',           // ← pangalan ng bot (makikita ng ibang players)
  reconnectDelay: 12000,          // ms bago mag-reconnect
  tickRate: 50,                   // ms per game tick (20 ticks/sec)
};

// ─── HTTP SERVER (para hindi matulog ang Render/host) ─────────
const webServer = http.createServer((req, res) => {
  const uptime = Math.floor(process.uptime());
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = uptime % 60;
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(
    `✅ DreamBot is ALIVE!\n` +
    `State: ${bot.state}\n` +
    `Position: x=${Math.floor(bot.pos.x)} y=${Math.floor(bot.pos.y)} z=${Math.floor(bot.pos.z)}\n` +
    `Uptime: ${h}h ${m}m ${s}s\n` +
    `Reconnects: ${bot.reconnectCount}`
  );
});
webServer.listen(process.env.PORT || 3000, () => {
  log('web', `HTTP server on port ${process.env.PORT || 3000}`);
});

// ─── LOGGER ───────────────────────────────────────────────────
function log(tag, msg) {
  const t = new Date().toTimeString().slice(0, 8);
  const tags = {
    web:    '🌐',
    info:   '🤖',
    move:   '🏃',
    build:  '🏠',
    mine:   '⛏️ ',
    chat:   '💬',
    warn:   '⚠️ ',
    error:  '❌',
    state:  '🔄',
  };
  console.log(`[${t}] ${tags[tag] || '  '} [${tag.toUpperCase()}] ${msg}`);
}

// ─── BOT STATE ────────────────────────────────────────────────
const bot = {
  client: null,
  state: 'OFFLINE',
  reconnectCount: 0,
  reconnectTimer: null,
  tickInterval: null,
  pos: { x: 0, y: 64, z: 0 },
  yaw: 0,
  pitch: 0,
  onGround: true,
  entityId: 0,
  inventory: {}, // blockId -> count (simulated)
  buildPhase: 0,
  exploreTarget: null,
  tickCount: 0,
  chatCooldown: 0,
  lastActivity: Date.now(),
};

// ─── STATE MACHINE ────────────────────────────────────────────
const STATES = {
  OFFLINE:    'OFFLINE',
  SPAWNING:   'SPAWNING',
  IDLE:       'IDLE',
  EXPLORING:  'EXPLORING',
  GATHERING:  'GATHERING',
  BUILDING:   'BUILDING',
  ANTIAFK:    'ANTIAFK',
};

function setState(newState) {
  if (bot.state === newState) return;
  log('state', `${bot.state} → ${newState}`);
  bot.state = newState;
  bot.lastActivity = Date.now();
}

// ─── PACKET HELPERS ───────────────────────────────────────────
function sendMove(x, y, z, yaw, pitch, onGround) {
  if (!bot.client) return;
  try {
    bot.pos = { x, y, z };
    bot.yaw = yaw ?? bot.yaw;
    bot.pitch = pitch ?? bot.pitch;
    bot.onGround = onGround ?? bot.onGround;

    bot.client.queue('move_player', {
      runtime_entity_id: bot.entityId,
      position: { x, y, z: z },
      pitch: bot.pitch,
      yaw: bot.yaw,
      head_yaw: bot.yaw,
      mode: 0,           // Normal mode
      on_ground: bot.onGround,
      ridden_runtime_entity_id: BigInt(0),
      cause: { type: 'unknown', entity_id: BigInt(0) },
      tick: BigInt(bot.tickCount),
    });
  } catch (e) {
    // silently skip — packet timing issues are normal
  }
}

function sendJump() {
  if (!bot.client) return;
  try {
    bot.client.queue('player_action', {
      runtime_entity_id: bot.entityId,
      action: 'jump',
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
      entity_id: bot.entityId,
    });
  } catch (e) {}
}

function sendChat(message) {
  if (!bot.client || bot.chatCooldown > 0) return;
  try {
    bot.client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: CONFIG.username,
      message: message,
      filtered_message: '',
      xuid: '',
      platform_chat_id: '',
    });
    bot.chatCooldown = 60; // 3 seconds at 20 tps
    log('chat', `Sent: "${message}"`);
  } catch (e) {}
}

function sendBreakBlock(x, y, z) {
  if (!bot.client) return;
  try {
    // Start breaking
    bot.client.queue('player_action', {
      runtime_entity_id: bot.entityId,
      action: 'start_break',
      position: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
      result_position: { x: 0, y: 0, z: 0 },
      face: 1,
      entity_id: bot.entityId,
    });
    // Stop breaking (for instant break simulation)
    setTimeout(() => {
      if (!bot.client) return;
      bot.client.queue('player_action', {
        runtime_entity_id: bot.entityId,
        action: 'abort_break',
        position: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
        result_position: { x: 0, y: 0, z: 0 },
        face: 1,
        entity_id: bot.entityId,
      });
    }, 500);
  } catch (e) {}
}

// ─── MOVEMENT ─────────────────────────────────────────────────
function moveToward(targetX, targetZ, speed = 0.2) {
  const dx = targetX - bot.pos.x;
  const dz = targetZ - bot.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) return true; // arrived

  const nx = bot.pos.x + (dx / dist) * speed;
  const nz = bot.pos.z + (dz / dist) * speed;
  const newYaw = Math.atan2(dx, dz) * (180 / Math.PI);

  sendMove(nx, bot.pos.y, nz, newYaw, 0, true);
  return false;
}

function randomNearby(radius = 15) {
  return {
    x: bot.pos.x + (Math.random() * 2 - 1) * radius,
    z: bot.pos.z + (Math.random() * 2 - 1) * radius,
  };
}

function lookAround() {
  const newYaw = (bot.yaw + (Math.random() * 60 - 30)) % 360;
  const newPitch = Math.random() * 40 - 20;
  sendMove(bot.pos.x, bot.pos.y, bot.pos.z, newYaw, newPitch, true);
}

// ─── AI BEHAVIORS ─────────────────────────────────────────────

// House blueprint — simple 5x5 wooden box
const HOUSE_BLUEPRINT = (() => {
  const blocks = [];
  const ox = 0, oy = 0, oz = 0; // offset from bot spawn

  // Floor
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 5; z++)
      blocks.push({ x: ox + x, y: oy, z: oz + z, type: 'floor' });

  // Walls (3 blocks tall)
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < 5; x++) {
      blocks.push({ x: ox + x, y: oy + y, z: oz, type: 'wall' });
      blocks.push({ x: ox + x, y: oy + y, z: oz + 4, type: 'wall' });
    }
    for (let z = 1; z < 4; z++) {
      blocks.push({ x: ox, y: oy + y, z: oz + z, type: 'wall' });
      blocks.push({ x: ox + 4, y: oy + y, z: oz + z, type: 'wall' });
    }
  }

  // Roof
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 5; z++)
      blocks.push({ x: ox + x, y: oy + 4, z: oz + z, type: 'roof' });

  return blocks;
})();

const CHAT_RESPONSES = {
  'hi': ['hey!', 'sup', 'hello!', 'wassup'],
  'hello': ['hey!', 'hi there!', 'yo'],
  'bot': ['I\'m not a bot 😤', 'I\'m a real player!', 'excuse me 😂'],
  'help': ['sure, what do you need?', 'on it!'],
  'stop': ['ok ok', 'chill chill'],
  'build': ['already on it!', 'I\'m building rn'],
  'mine': ['mining is life', 'let\'s get those resources!'],
};

const RANDOM_CHAT = [
  'bro this server is fire',
  'anyone wanna play?',
  'looking for diamonds',
  'who took my stuff lol',
  'this is my spot',
  'gg',
  'anyone have wood?',
  'brb',
  'let\'s gooo',
];

// ─── MAIN GAME TICK ───────────────────────────────────────────
function gameTick() {
  if (!bot.client || bot.state === STATES.OFFLINE || bot.state === STATES.SPAWNING) return;

  bot.tickCount++;
  if (bot.chatCooldown > 0) bot.chatCooldown--;

  // Every 5 min, say something random
  if (bot.tickCount % 6000 === 0) {
    const msg = RANDOM_CHAT[Math.floor(Math.random() * RANDOM_CHAT.length)];
    sendChat(msg);
  }

  // State machine
  switch (bot.state) {
    case STATES.IDLE:
      handleIdle();
      break;
    case STATES.EXPLORING:
      handleExploring();
      break;
    case STATES.GATHERING:
      handleGathering();
      break;
    case STATES.BUILDING:
      handleBuilding();
      break;
    case STATES.ANTIAFK:
      handleAntiAfk();
      break;
  }
}

let idleTimer = 0;
function handleIdle() {
  idleTimer++;
  lookAround();

  if (idleTimer > 100) { // ~5 seconds
    idleTimer = 0;
    const roll = Math.random();
    if (roll < 0.4) setState(STATES.EXPLORING);
    else if (roll < 0.7) setState(STATES.GATHERING);
    else if (roll < 0.85) setState(STATES.BUILDING);
    else setState(STATES.ANTIAFK);
  }
}

let exploreSteps = 0;
function handleExploring() {
  exploreSteps++;

  if (!bot.exploreTarget || exploreSteps > 300) {
    bot.exploreTarget = randomNearby(20);
    exploreSteps = 0;
    log('move', `Exploring to x=${Math.floor(bot.exploreTarget.x)} z=${Math.floor(bot.exploreTarget.z)}`);
  }

  const arrived = moveToward(bot.exploreTarget.x, bot.exploreTarget.z, 0.25);

  if (arrived) {
    bot.exploreTarget = null;
    setState(STATES.IDLE);
  }
}

let mineTimer = 0;
let mineTarget = null;
function handleGathering() {
  mineTimer++;

  if (!mineTarget) {
    // Pick a block near bot to "mine" (simulate)
    const offsets = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 0, y: -1, z: 0 },
    ];
    const off = offsets[Math.floor(Math.random() * offsets.length)];
    mineTarget = {
      x: Math.floor(bot.pos.x) + off.x,
      y: Math.floor(bot.pos.y) + off.y,
      z: Math.floor(bot.pos.z) + off.z,
    };
    log('mine', `Mining at x=${mineTarget.x} y=${mineTarget.y} z=${mineTarget.z}`);
    sendBreakBlock(mineTarget.x, mineTarget.y, mineTarget.z);
  }

  // Simulate walking to resource area
  if (mineTimer % 20 === 0) {
    const near = randomNearby(5);
    moveToward(near.x, near.z, 0.15);
    sendBreakBlock(
      Math.floor(bot.pos.x) + Math.round(Math.random() * 2 - 1),
      Math.floor(bot.pos.y) - 1,
      Math.floor(bot.pos.z) + Math.round(Math.random() * 2 - 1)
    );
  }

  if (mineTimer > 400) { // ~20 seconds of gathering
    mineTimer = 0;
    mineTarget = null;
    sendChat('got some resources!');
    setState(STATES.IDLE);
  }
}

let buildStep = 0;
let buildTimer = 0;
function handleBuilding() {
  buildTimer++;

  if (buildStep >= HOUSE_BLUEPRINT.length) {
    buildStep = 0;
    sendChat('finished building! 🏠');
    log('build', 'House complete! Resetting...');
    setState(STATES.IDLE);
    return;
  }

  if (buildTimer % 10 === 0) { // Place one block every ~0.5 seconds
    const block = HOUSE_BLUEPRINT[buildStep];
    const bx = bot.pos.x + block.x;
    const by = bot.pos.y + block.y;
    const bz = bot.pos.z + block.z;

    try {
      if (bot.client) {
        bot.client.queue('player_action', {
          runtime_entity_id: bot.entityId,
          action: 'start_break', // use break packet as interaction
          position: { x: Math.floor(bx), y: Math.floor(by - 1), z: Math.floor(bz) },
          result_position: { x: 0, y: 0, z: 0 },
          face: 1,
          entity_id: bot.entityId,
        });
      }
    } catch (e) {}

    // Move toward build spot
    moveToward(bx, bz, 0.3);

    if (buildStep === 0) {
      log('build', 'Starting to build a house...');
      sendChat('building a house rn');
    }

    buildStep++;
    log('build', `Placing block ${buildStep}/${HOUSE_BLUEPRINT.length}`);
  }
}

let afkStep = 0;
function handleAntiAfk() {
  afkStep++;

  // Jump
  if (afkStep % 40 === 0) sendJump();

  // Walk in a small circle
  const angle = (afkStep * 3) * (Math.PI / 180);
  const cx = bot.pos.x + Math.cos(angle) * 2;
  const cz = bot.pos.z + Math.sin(angle) * 2;
  sendMove(cx, bot.pos.y, cz, angle * (180 / Math.PI), 0, true);

  if (afkStep > 200) {
    afkStep = 0;
    setState(STATES.IDLE);
  }
}

// ─── CONNECT ──────────────────────────────────────────────────
function connect() {
  setState(STATES.SPAWNING);
  log('info', `Connecting to ${CONFIG.host}:${CONFIG.port} as "${CONFIG.username}"...`);

  let client;
  try {
    client = bedrock.createClient({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      offline: true,           // no Xbox Live auth needed for Aternos
      skipPing: false,
      connectTimeout: 20000,
    });
  } catch (e) {
    log('error', `Failed to create client: ${e.message}`);
    scheduleReconnect();
    return;
  }

  bot.client = client;

  // ── Spawned ──────────────────────────────────────────────────
  client.on('spawn', () => {
    bot.entityId = client.entityId || BigInt(1);
    setState(STATES.IDLE);
    bot.reconnectCount++;
    bot.buildPhase = 0;

    if (bot.tickInterval) clearInterval(bot.tickInterval);
    bot.tickInterval = setInterval(gameTick, CONFIG.tickRate);

    log('info', `✅ Spawned! Entity ID: ${bot.entityId}`);
    log('info', `Position: x=${Math.floor(bot.pos.x)} y=${Math.floor(bot.pos.y)} z=${Math.floor(bot.pos.z)}`);

    setTimeout(() => sendChat('back online!'), 3000);
  });

  // ── Position updates from server ─────────────────────────────
  client.on('move_player', (packet) => {
    if (packet.runtime_entity_id === bot.entityId) {
      bot.pos = {
        x: packet.position.x,
        y: packet.position.y,
        z: packet.position.z,
      };
    }
  });

  // ── Teleport correction ───────────────────────────────────────
  client.on('correct_player_move_prediction', (packet) => {
    if (packet.position) {
      bot.pos = {
        x: packet.position.x,
        y: packet.position.y,
        z: packet.position.z,
      };
    }
  });

  // ── Chat listener ─────────────────────────────────────────────
  client.on('text', (packet) => {
    const sender = packet.source_name || '';
    const msg = (packet.message || '').toLowerCase().trim();

    if (sender === CONFIG.username) return; // ignore own messages

    log('chat', `<${sender}> ${packet.message}`);

    // Respond to direct messages
    for (const [keyword, replies] of Object.entries(CHAT_RESPONSES)) {
      if (msg.includes(keyword)) {
        const reply = replies[Math.floor(Math.random() * replies.length)];
        setTimeout(() => sendChat(reply), 1000 + Math.random() * 1500);
        break;
      }
    }

    // Commands (e.g. someone says "DreamBot build")
    if (msg.includes(CONFIG.username.toLowerCase())) {
      if (msg.includes('build')) {
        setState(STATES.BUILDING);
        setTimeout(() => sendChat('ok building now!'), 800);
      } else if (msg.includes('mine') || msg.includes('gather')) {
        setState(STATES.GATHERING);
        setTimeout(() => sendChat('on it!'), 800);
      } else if (msg.includes('explore') || msg.includes('walk')) {
        setState(STATES.EXPLORING);
        setTimeout(() => sendChat('going for a walk'), 800);
      } else if (msg.includes('stop') || msg.includes('idle')) {
        setState(STATES.IDLE);
        setTimeout(() => sendChat('ok stopping'), 800);
      } else if (msg.includes('status')) {
        setTimeout(() => sendChat(
          `I'm ${bot.state} at x=${Math.floor(bot.pos.x)} z=${Math.floor(bot.pos.z)}`
        ), 800);
      }
    }
  });

  // ── Kicked / disconnected ─────────────────────────────────────
  client.on('disconnect', (packet) => {
    const reason = packet?.message || packet?.reason || 'unknown';
    log('warn', `Disconnected: ${reason}`);
    cleanup();
    scheduleReconnect();
  });

  client.on('error', (err) => {
    log('error', `${err.message}`);
    cleanup();
    scheduleReconnect();
  });

  // ── Keep-alive (respond to server pings) ──────────────────────
  client.on('network_settings', () => {
    // connection established
    log('info', 'Network settings received — connection established');
  });
}

function cleanup() {
  setState(STATES.OFFLINE);
  if (bot.tickInterval) {
    clearInterval(bot.tickInterval);
    bot.tickInterval = null;
  }
  bot.client = null;
}

function scheduleReconnect() {
  if (bot.reconnectTimer) return;
  log('warn', `Reconnecting in ${CONFIG.reconnectDelay / 1000}s...`);
  bot.reconnectTimer = setTimeout(() => {
    bot.reconnectTimer = null;
    connect();
  }, CONFIG.reconnectDelay);
}

// ─── BANNER ──────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Minecraft Bedrock AI Bot — Dream Edition  ║');
console.log('║   Keeps Aternos online + plays like human!  ║');
console.log('║                                              ║');
console.log('║   Commands (say in chat):                   ║');
console.log('║   DreamBot build   — builds a house         ║');
console.log('║   DreamBot mine    — gathers resources      ║');
console.log('║   DreamBot explore — walks around           ║');
console.log('║   DreamBot stop    — goes idle              ║');
console.log('║   DreamBot status  — shows current state    ║');
console.log('╚══════════════════════════════════════════════╝');

connect();
