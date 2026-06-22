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

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), lastState: null });
  }
  return rooms.get(roomId);
}

function assignPlayer(room) {
  const used = new Set([...room.clients].map(client => client.player).filter(player => player === 0 || player === 1));
  if (!used.has(0)) return 0;
  if (!used.has(1)) return 1;
  return 2;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload, except = null) {
  for (const client of room.clients) {
    if (client !== except) send(client, payload);
  }
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
      ws.roomId = roomId;
      ws.player = assignPlayer(room);
      room.clients.add(ws);

      send(ws, {
        type: 'joined',
        clientId: ws.clientId,
        roomId,
        player: ws.player,
        clients: room.clients.size,
        state: room.lastState
      });

      broadcast(room, {
        type: 'room-update',
        roomId,
        clients: room.clients.size,
        notice: ws.player < 2 ? `玩家${ws.player + 1}已加入房间` : '一名观战者已加入房间'
      }, ws);
      return;
    }

    if (message.type === 'state') {
      if (!ws.roomId || !rooms.has(ws.roomId)) return;
      const room = rooms.get(ws.roomId);
      if (!message.state || message.state.partial !== 'motion') {
        room.lastState = message.state;
      }
      broadcast(room, {
        type: 'state',
        reason: message.reason,
        state: message.state
      }, ws);
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
    }
  });

  ws.on('close', () => {
    if (!ws.roomId || !rooms.has(ws.roomId)) return;
    const room = rooms.get(ws.roomId);
    room.clients.delete(ws);
    if (room.clients.size === 0) {
      rooms.delete(ws.roomId);
      return;
    }
    broadcast(room, {
      type: 'room-update',
      roomId: ws.roomId,
      clients: room.clients.size,
      notice: ws.player < 2 ? `玩家${ws.player + 1}已离开房间` : '一名观战者已离开房间'
    });
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
  console.log(`Snooker online server running at http://localhost:${PORT}`);
});
