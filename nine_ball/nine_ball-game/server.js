const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/game_2d_online.html';
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
let nextClientId = 1;

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload, except = null) {
  for (const client of room.players) {
    if (client && client !== except) send(client, payload);
  }
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: [null, null],
      gameState: null,
      currentTurn: 0,
      gameStarted: false
    });
  }
  return rooms.get(roomId);
}

function roomPlayersCount(room) {
  return room.players.filter(p => p !== null).length;
}

function initGameState() {
  return {
    balls: createRackState(),
    scores: [0, 0],
    currentPlayer: 0,
    controlPlayer: 0,
    phase: 'break',
    currentBreak: 0,
    consecutiveFouls: [0, 0],
    freeBallMode: false,
    freeBallTargetNumber: null,
    isPlacingBall: true,
    ballMoving: false,
    allBallsStopped: true,
    gameStarted: false,
    pushOutAvailable: false,
    awaitingPushOutDecision: false,
    pushOutDecisionPlayer: null,
    frameStarter: 0,
    shotAuthorityPlayer: null,
    message: '玩家1：请在发球线后放置白球'
  };
}

function createRackState() {
  const BALL_RADIUS = 5;
  const spacing = BALL_RADIUS * 2.05;
  const TABLE_INNER_LENGTH = 508;
  const TABLE_INNER_WIDTH = 254;
  const BORDER = 6;

  const rackX = BORDER + TABLE_INNER_LENGTH * 0.75;
  const rackY = BORDER + TABLE_INNER_WIDTH / 2;
  const dCenterX = BORDER + TABLE_INNER_LENGTH * 0.25;

  const positions = [
    { row: 0, col: 0 }, { row: 1, col: -1 }, { row: 1, col: 1 },
    { row: 2, col: -2 }, { row: 2, col: 0 }, { row: 2, col: 2 },
    { row: 3, col: -1 }, { row: 3, col: 1 }, { row: 4, col: 0 }
  ];
  const numbers = [1, 2, 3, 4, 9, 5, 6, 7, 8];

  const balls = [];
  balls.push({ number: 0, type: 'white', x: dCenterX, y: rackY, vx: 0, vy: 0, sideSpin: 0 });

  numbers.forEach((num, i) => {
    const pos = positions[i];
    const bx = rackX + pos.row * spacing * 0.866;
    const by = rackY + pos.col * spacing / 2;
    balls.push({ number: num, type: 'numbered', x: bx, y: by, vx: 0, vy: 0, sideSpin: 0 });
  });

  return balls;
}

wss.on('connection', (ws) => {
  ws.clientId = String(nextClientId++);
  ws.roomId = null;
  ws.player = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      send(ws, { type: 'error', message: '消息格式错误' });
      return;
    }

    if (message.type === 'join') {
      const roomId = String(message.roomId || '').trim().slice(0, 32);
      if (!roomId) {
        send(ws, { type: 'error', message: '房间号不能为空' });
        return;
      }

      const room = getRoom(roomId);

      if (ws.roomId && ws.roomId !== roomId) {
        const oldRoom = rooms.get(ws.roomId);
        if (oldRoom) {
          const idx = oldRoom.players.indexOf(ws);
          if (idx !== -1) oldRoom.players[idx] = null;
          broadcast(oldRoom, { type: 'room-update', roomId: ws.roomId, players: oldRoom.players.map(p => p !== null) });
        }
      }

      ws.roomId = roomId;

      let playerSlot = room.players.indexOf(ws);
      if (playerSlot === -1) {
        playerSlot = room.players.indexOf(null);
        if (playerSlot === -1) {
          send(ws, { type: 'error', message: '房间已满' });
          return;
        }
        room.players[playerSlot] = ws;
      }
      ws.player = playerSlot;

      send(ws, {
        type: 'joined',
        clientId: ws.clientId,
        roomId,
        player: playerSlot,
        players: room.players.map(p => p !== null)
      });

      broadcast(room, {
        type: 'room-update',
        roomId,
        players: room.players.map(p => p !== null),
        notice: `玩家${playerSlot + 1}已加入`
      }, ws);

      if (roomPlayersCount(room) === 2 && !room.gameStarted) {
        room.gameStarted = true;
        room.currentTurn = 0;
        const state = initGameState();
        room.gameState = state;

        send(room.players[0], {
          type: 'game-started',
          state: state,
          yourTurn: true,
          player: 0
        });
        send(room.players[1], {
          type: 'game-started',
          state: state,
          yourTurn: false,
          player: 1
        });
      }

      return;
    }

    if (message.type === 'state') {
      if (!ws.roomId || !rooms.has(ws.roomId)) return;
      const room = rooms.get(ws.roomId);
      if (!room.gameStarted || ws.player !== room.currentTurn) return;
      const state = message.state;
      if (!state || !Array.isArray(state.balls)) return;

      if (state.partial === 'motion') {
        broadcast(room, {
          type: 'state',
          reason: message.reason || 'shot-update',
          state
        }, ws);
        return;
      }

      const controlPlayer = state.controlPlayer === 1 ? 1 : 0;
      room.gameState = state;
      room.currentTurn = controlPlayer;
      broadcast(room, {
        type: 'state',
        reason: message.reason || 'state-update',
        state
      }, ws);
      return;
    }

    if (message.type === 'reset-game') {
      if (!ws.roomId || !rooms.has(ws.roomId) || ws.player !== 0) return;
      const room = rooms.get(ws.roomId);
      const state = message.state;
      if (!state || !Array.isArray(state.balls)) return;
      room.gameStarted = true;
      room.currentTurn = 0;
      room.gameState = state;
      broadcast(room, {
        type: 'state',
        reason: 'reset-game',
        state
      }, ws);
      return;
    }

    if (message.type === 'turn-done') {
      if (!ws.roomId || !rooms.has(ws.roomId)) return;
      const room = rooms.get(ws.roomId);
      if (ws.player !== room.currentTurn) return;
      if (!room.gameStarted) return;

      const newState = message.state;
      if (!newState || !newState.balls) return;

      room.gameState = newState;
      room.currentTurn = newState.currentPlayer === 1 ? 1 : 0;

      send(ws, {
        type: 'state-update',
        state: newState,
        yourTurn: ws.player === room.currentTurn
      });

      const opponent = room.players[1 - ws.player];
      if (opponent) {
        send(opponent, {
          type: 'state-update',
          state: newState,
          yourTurn: opponent.player === room.currentTurn
        });
      }

      return;
    }

    if (message.type === 'sound') {
      if (!ws.roomId || !rooms.has(ws.roomId)) return;
      const allowedSounds = new Set(['cue', 'ball', 'cushion', 'pocket']);
      if (!allowedSounds.has(message.sound)) return;
      const now = Date.now();
      if (now - (ws.lastSoundAt || 0) < 8) return;
      ws.lastSoundAt = now;
      const room = rooms.get(ws.roomId);
      broadcast(room, {
        type: 'sound',
        sound: message.sound,
        intensity: Math.max(0, Math.min(100, Number(message.intensity) || 0)),
        detail: message.detail === 'white' ? 'white' : 'color'
      }, ws);
      return;
    }

    if (message.type === 'chat') {
      if (!ws.roomId || !rooms.has(ws.roomId)) return;
      const room = rooms.get(ws.roomId);
      const text = String(message.text || '').trim().slice(0, 100);
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        player: ws.player,
        text
      });
      return;
    }
  });

  ws.on('close', () => {
    if (!ws.roomId || !rooms.has(ws.roomId)) return;
    const room = rooms.get(ws.roomId);
    const idx = room.players.indexOf(ws);
    if (idx !== -1) room.players[idx] = null;

    room.gameStarted = false;
    room.gameState = null;

    broadcast(room, {
      type: 'room-update',
      roomId: ws.roomId,
      players: room.players.map(p => p !== null),
      notice: `玩家${ws.player + 1}已离开，游戏结束`
    });

    if (roomPlayersCount(room) === 0) {
      rooms.delete(ws.roomId);
    }
  });
});

const heartbeatInterval = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, () => {
  console.log(`Nine-ball online server running at http://localhost:${PORT}`);
});
