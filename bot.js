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

function parseVersionParts(v) {
  return String(v).split('.').map((n) => parseInt(n, 10) || 0);
}

// Kumpara ng dalawang version parts, tulad ng semver comparison.
// Negative kung a < b, positive kung a > b, 0 kung pareho.
function compareVersionParts(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickBestVersion(detectedVersion) {
  const supported = getSupportedVersions();
  if (!supported || supported.length === 0) return detectedVersion;

  if (supported.includes(detectedVersion)) {
    return detectedVersion;
  }

  console.log(`⚠️ Version ${detectedVersion} ay hindi supported ng naka-install na library.`);
  console.log(`📦 Supported versions ngayon: ${supported.join(', ')}`);

  const target = parseVersionParts(detectedVersion);

  // Pipiliin ang PINAKAMALAPIT na supported version sa detected version —
  // priority: pinakamalapit na mas MATAAS/bagong version muna (mas malamang
  // magkapareho ang protocol number sa mga magkalapit na patch),
  // pero kung wala nang mas mataas, kukunin na lang ang pinakamalapit na mas mababa.
  let closestHigher = null;
  let closestLower = null;

  for (const v of supported) {
    const parts = parseVersionParts(v);
    const cmp = compareVersionParts(parts, target);

    if (cmp >= 0) {
      if (!closestHigher || compareVersionParts(parts, parseVersionParts(closestHigher)) < 0) {
        closestHigher = v;
      }
    } else {
      if (!closestLower || compareVersionParts(parts, parseVersionParts(closestLower)) > 0) {
        closestLower = v;
      }
    }
  }

  const fallback = closestLower || closestHigher || supported[0];
  console.log(`🔧 Gagamitin na lang ang pinakamalapit na supported version: ${fallback}`);
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
  // Kung may FORCE_VERSION na naka-set sa Environment Variables ng Render,
  // gagamitin yun sa halip — para makapag-test ka ng ibang version nang
  // mabilis nang hindi na kailangang i-edit at i-commit ang code paulit-ulit.
  let versionToUse;
  if (process.env.FORCE_VERSION) {
    versionToUse = process.env.FORCE_VERSION;
    console.log(`📌 May FORCE_VERSION na naka-set sa environment: ${versionToUse}`);
  } else {
    const detectedVersion = await detectServerVersion();
    versionToUse = detectedVersion ? pickBestVersion(detectedVersion) : null;
  }

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

  // ═══════════════════════════════════════════════════════
  // BOT "AWARENESS" STATE
  // Dito natin ita-track ang kalagayan ng bot: saan siya
  // nakatayo, gaano na siya kalayo sa buhay, atbp.
  // ═══════════════════════════════════════════════════════
  const botState = {
    position: { x: 0, y: 64, z: 0 },
    rotation: { yaw: 0, pitch: 0 },
    tick: BigInt(0),
    health: 20,
    lastHealth: 20,
    fleeing: false,
    fleeUntil: 0,
    wanderTarget: null,
  };

  client.on('spawn', () => {
    console.log('✅ Bot is IN the server! Server will stay online.');

    // ── Kunin ang starting position mula sa start_game packet ──
    // (Nakuha na ito bago pa man mag-spawn, pero i-double check natin dito.)

    // ═══════════════════════════════════════════════════
    // 1. DANGER / HEALTH AWARENESS
    // Nakikinig tayo sa 'update_attributes' packet — dito
    // ipinapadala ng server ang health (at iba pang stats)
    // ng entity. Kapag bumaba ang health ng bot, ibig
    // sabihin may kumakain/nananakit sa kanya.
    // ═══════════════════════════════════════════════════
    client.on('update_attributes', (packet) => {
      try {
        if (packet.runtime_entity_id != client.entityId) return; // hindi tayo, ibang entity

        const healthAttr = (packet.attributes || []).find(
          (a) => a.name === 'minecraft:health'
        );
        if (!healthAttr) return;

        botState.lastHealth = botState.health;
        botState.health = healthAttr.current;

        if (botState.health < botState.lastHealth) {
          console.log(`⚠️ Sumasakit ang bot! Health: ${botState.health}/${healthAttr.max}`);
          triggerFlee();
        }

        if (botState.health <= 6 && botState.health > 0) {
          console.log('🚨 MABABA NA ANG HEALTH! Nag-fflee nang mas matagal.');
          triggerFlee(8000); // mas matagal na pagtakbo kung malapit nang mamatay
        }
      } catch (e) {
        console.log('❌ Error sa update_attributes handler:', e.message);
      }
    });

    function triggerFlee(durationMs = 3000) {
      botState.fleeing = true;
      botState.fleeUntil = Date.now() + durationMs;
      // Pumili ng random na direksyon papalayo — simpleng
      // "takbo palayo" lang, hindi pa niya alam kung saan
      // talaga ang panganib (kailangan ng entity-tracking
      // para dun, na mas komplikadong feature pa).
      botState.wanderTarget = null; // i-reset para pumili ng bagong direksyon agad
    }

    // ═══════════════════════════════════════════════════
    // 2. MOVEMENT / WANDERING
    // Bedrock protocol (modernong versions) ay gumagamit ng
    // 'player_auth_input' packet para sa movement — ito ang
    // ipinapadala ng totoong client kada tick. Susubukan
    // nating gayahin ito para "gumagalaw nang normal" ang bot,
    // sa halip na jump lang paulit-ulit sa iisang spot.
    //
    // PAALALA: Posibleng may mga fields dito na kailangan
    // pang i-adjust base sa aktwal na error/behavior na
    // makikita natin sa logs — hindi ito 100% garantisadong
    // tama sa unang subok, dahil kada Bedrock version medyo
    // nagbabago ang structure ng packet na ito.
    // ═══════════════════════════════════════════════════
    const MOVE_SPEED = 0.15; // blocks per tick, katamtaman lang
    const WANDER_RADIUS = 6; // gaano kalayo maglalakad papalayo sa "home" point
    const homePosition = { ...botState.position };

    function pickNewWanderTarget() {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * WANDER_RADIUS;
      botState.wanderTarget = {
        x: homePosition.x + Math.cos(angle) * dist,
        z: homePosition.z + Math.sin(angle) * dist,
      };
    }

    const movementInterval = setInterval(() => {
      try {
        botState.tick += BigInt(1);

        let moving = false;
        let dx = 0;
        let dz = 0;

        if (botState.fleeing) {
          if (Date.now() > botState.fleeUntil) {
            botState.fleeing = false;
          } else {
            if (!botState.wanderTarget) pickNewWanderTarget();
            moving = true;
          }
        } else {
          // Random chance na maglakad-lakad (parang normal player,
          // hindi palaging gumagalaw).
          if (!botState.wanderTarget && Math.random() < 0.03) {
            pickNewWanderTarget();
          }
          if (botState.wanderTarget) moving = true;
        }

        if (moving && botState.wanderTarget) {
          const targetDx = botState.wanderTarget.x - botState.position.x;
          const targetDz = botState.wanderTarget.z - botState.position.z;
          const dist = Math.sqrt(targetDx * targetDx + targetDz * targetDz);

          if (dist < 0.3) {
            // Naabot na ang target, huminto muna.
            botState.wanderTarget = null;
          } else {
            const speed = botState.fleeing ? MOVE_SPEED * 2 : MOVE_SPEED;
            dx = (targetDx / dist) * speed;
            dz = (targetDz / dist) * speed;
            botState.rotation.yaw = (Math.atan2(-targetDx, targetDz) * 180) / Math.PI;
          }
        }

        botState.position.x += dx;
        botState.position.z += dz;

        client.queue('player_auth_input', {
          tick: botState.tick,
          position: botState.position,
          position_delta: { x: dx, y: 0, z: dz },
          rotation: { x: botState.rotation.pitch, y: botState.rotation.yaw },
          interact_rotation: { x: botState.rotation.pitch, y: botState.rotation.yaw },
          input_data: {},
          input_mode: 'mouse',
          play_mode: 'normal',
          interaction_model: 'classic',
          item_interaction_data: {},
          predicted_vehicle: null,
          analogue_move_vector: { x: 0, z: dz === 0 && dx === 0 ? 0 : 1 },
        });
      } catch (e) {
        console.log('❌ Error sa movement loop:', e.message);
      }
    }, 100); // 10 beses kada segundo, mas madalas kaysa jump lang

    // Jump paminsan-minsan pa rin, para hindi tuluyang tigil
    // kahit sa mga sandaling walang wander target.
    const jumpInterval = setInterval(() => {
      try {
        client.queue('player_action', {
          action: 'jump',
          position: botState.position,
          result_position: botState.position,
          face: 0,
          entity_id: client.entityId,
        });
      } catch (e) {}
    }, 6000);

    // ═══════════════════════════════════════════════════
    // 3. CHAT AWARENESS — sumasagot kapag may nag-mention
    // sa username ng bot, o nagsabi ng mga trigger words.
    // ═══════════════════════════════════════════════════
    client.on('text', (packet) => {
      try {
        if (packet.type !== 'chat') return;
        if (packet.source_name === CONFIG.username) return; // huwag sumagot sa sarili

        const msg = (packet.message || '').toLowerCase();
        const botNameLower = CONFIG.username.toLowerCase();

        let reply = null;

        if (msg.includes(botNameLower)) {
          reply = `Uy ${packet.source_name}! Nandito lang ako 👋`;
        } else if (msg.includes('kumusta') || msg.includes('hi') || msg.includes('hello')) {
          reply = `Kamusta, ${packet.source_name}! 🙂`;
        } else if (msg.includes('!build')) {
          reply = `Sige, susubukan kong magtayo malapit dito! 🏗️`;
          attemptSimpleHouse();
        }

        if (reply) {
          client.queue('text', {
            type: 'chat',
            needs_translation: false,
            source_name: CONFIG.username,
            xuid: '',
            platform_chat_id: '',
            filtered_message: '',
            message: reply,
          });
        }
      } catch (e) {
        console.log('❌ Error sa chat handler:', e.message);
      }
    });

    // ═══════════════════════════════════════════════════
    // 4. EXPERIMENTAL: SIMPLE HOUSE BUILDING
    //
    // MAHALAGANG PAALALA: Ito ang pinaka-eksperimental na
    // bahagi. Para makapaglagay ng block, kailangan:
    //   a) May placeable block ITEM sa hotbar slot 0 ng bot
    //      (kailangan mo munang i-/give sa bot habang naka-OP ka,
    //      hindi pa niya alam mag-gather/mag-crafting)
    //   b) Tamang block_runtime_id na tugma sa version ng server
    //   c) Walang existing block sa target position (dapat hangin)
    //
    // Kung hindi gumana sa unang subok, normal lang — ipadala mo
    // sa akin ang logs pagkatapos mong i-type ang "!build" sa
    // chat, para makita natin kung anong error ang lumalabas at
    // maayos natin ang exact packet structure.
    // ═══════════════════════════════════════════════════
    function attemptSimpleHouse() {
      try {
        const base = {
          x: Math.floor(botState.position.x),
          y: Math.floor(botState.position.y),
          z: Math.floor(botState.position.z) + 2, // konting layo sa harap ng bot
        };

        // Simpleng 3x3 na walls, 3 taas — pattern lang ito ng
        // COORDINATES na gustong punuan ng blocks. Susunod na
        // hakbang (kapag gumagana na ang basic placement) ay
        // ang pag-loop dito at pag-send ng inventory_transaction
        // packet kada position.
        const wallPositions = [];
        for (let y = 0; y < 3; y++) {
          for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
              const isEdge = Math.abs(x) === 1 || Math.abs(z) === 1;
              if (isEdge) {
                wallPositions.push({
                  x: base.x + x,
                  y: base.y + y,
                  z: base.z + z,
                });
              }
            }
          }
        }

        console.log(`🏗️ Susubukang maglagay ng ${wallPositions.length} blocks papasok sa bahay.`);

        let i = 0;
        const placeInterval = setInterval(() => {
          if (i >= wallPositions.length) {
            clearInterval(placeInterval);
            console.log('✅ Tapos na ang build attempt.');
            return;
          }

          const pos = wallPositions[i];
          try {
            client.queue('inventory_transaction', {
              legacy_request_id: 0,
              legacy_transactions: [],
              transaction: {
                transaction_type: 'item_use',
                actions: [],
                action_type: 0, // 0 = place block
                block_position: pos,
                face: 1, // top face; puwedeng kailangan i-adjust
                hotbar_slot: 0,
                item_in_hand: null,
                player_pos: botState.position,
                click_pos: { x: 0.5, y: 0.5, z: 0.5 },
                block_runtime_id: 0, // PANSAMANTALA — kailangan ng tamang value
              },
            });
          } catch (e) {
            console.log(`❌ Error sa pag-place ng block sa (${pos.x},${pos.y},${pos.z}):`, e.message);
          }

          i++;
        }, 300); // konting delay sa pagitan ng bawat block, parang normal player
      } catch (e) {
        console.log('❌ Error sa attemptSimpleHouse:', e.message);
      }
    }

    client.on('disconnect', () => {
      clearInterval(jumpInterval);
      clearInterval(movementInterval);
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
