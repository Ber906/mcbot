# 🤖 Minecraft Bedrock AFK Bot

Keeps your Aternos server online by staying connected 24/7!

## Setup

1. Install Node.js: https://nodejs.org

2. I-open ang terminal/command prompt sa folder na ito

3. I-install ang dependencies:
```
npm install
```

4. I-edit ang `bot.js` — palitan ang:
```js
host: '12-valencia.aternos.me',  ← IP ng server mo (tingnan sa Aternos)
port: 19132,                      ← port ng server
username: 'AFKBot',               ← pangalan na gusto mo
```

5. I-run ang bot:
```
npm start
```

## Tips
- Dapat naka-on ang PC mo habang tumatakbo ang bot
- Kung ma-kick ang bot, auto-reconnect siya after 10 seconds
- Pwede baguhin ang username sa kahit anong pangalan
