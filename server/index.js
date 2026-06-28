// server/index.js - Bukharo WebSocket Game Server

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { BukharoGame } = require('./game');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// In-memory store
const rooms = new Map(); // roomId -> { players, game, status, host }
const clients = new Map(); // ws -> { playerId, roomId, name }

function broadcast(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  wss.clients.forEach(ws => {
    const client = clients.get(ws);
    if (client && client.roomId === roomId && ws !== excludeWs && ws.readyState === 1) {
      ws.send(data);
    }
  });
}

function sendTo(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcastAll(roomId, message) {
  broadcast(roomId, message);
}

function getPlayersInRoom(roomId) {
  const result = [];
  wss.clients.forEach(ws => {
    const client = clients.get(ws);
    if (client && client.roomId === roomId) result.push({ id: client.playerId, name: client.name });
  });
  return result;
}

function sendGameState(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.game) return;

  wss.clients.forEach(ws => {
    const client = clients.get(ws);
    if (client && client.roomId === roomId && ws.readyState === 1) {
      const state = room.game.getState(client.playerId);
      sendTo(ws, { type: 'GAME_STATE', state });
    }
  });
}

wss.on('connection', (ws) => {
  clients.set(ws, { playerId: null, roomId: null, name: null });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const client = clients.get(ws);

    switch (msg.type) {
      case 'CREATE_ROOM': {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        const playerId = uuidv4();
        const name = msg.name || 'Player 1';
        rooms.set(roomId, {
          players: [{ id: playerId, name }],
          game: null,
          status: 'lobby',
          host: playerId
        });
        clients.set(ws, { playerId, roomId, name });
        sendTo(ws, { type: 'ROOM_CREATED', roomId, playerId, name });
        sendTo(ws, { type: 'LOBBY_UPDATE', players: [{ id: playerId, name }], host: playerId, roomId });
        break;
      }

      case 'JOIN_ROOM': {
        const { roomId, name } = msg;
        const room = rooms.get(roomId);
        if (!room) { sendTo(ws, { type: 'ERROR', message: 'Room not found' }); return; }
        if (room.status !== 'lobby') { sendTo(ws, { type: 'ERROR', message: 'Game already started' }); return; }
        if (room.players.length >= 8) { sendTo(ws, { type: 'ERROR', message: 'Room is full (max 8 players)' }); return; }

        const playerId = uuidv4();
        room.players.push({ id: playerId, name: name || `Player ${room.players.length + 1}` });
        clients.set(ws, { playerId, roomId, name: name || `Player ${room.players.length}` });

        sendTo(ws, { type: 'ROOM_JOINED', roomId, playerId, name: clients.get(ws).name });
        broadcastAll(roomId, { type: 'LOBBY_UPDATE', players: room.players, host: room.host, roomId });
        break;
      }

      case 'START_GAME': {
        const room = rooms.get(client.roomId);
        if (!room) return;
        if (room.host !== client.playerId) { sendTo(ws, { type: 'ERROR', message: 'Only the host can start' }); return; }
        if (room.players.length < 4) { sendTo(ws, { type: 'ERROR', message: 'Need at least 4 players' }); return; }
        if (room.players.length % 2 !== 0) { sendTo(ws, { type: 'ERROR', message: 'Need even number of players' }); return; }

        room.game = new BukharoGame(client.roomId, room.players);
        room.status = 'playing';

        broadcastAll(client.roomId, { type: 'GAME_STARTED', players: room.players });
        sendGameState(client.roomId);
        break;
      }

      case 'DRAW_CLOSED': {
        const room = rooms.get(client.roomId);
        if (!room?.game) return;
        const result = room.game.drawFromClosed(client.playerId);
        if (result.error) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
        broadcastAll(client.roomId, { type: 'ACTION', action: 'DRAW_CLOSED', playerId: client.playerId, playerName: client.name });
        sendGameState(client.roomId);
        break;
      }

      case 'TAKE_OPEN': {
        const room = rooms.get(client.roomId);
        if (!room?.game) return;
        const result = room.game.takeOpenPile(client.playerId);
        if (result.error) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
        broadcastAll(client.roomId, { type: 'ACTION', action: 'TAKE_OPEN', playerId: client.playerId, playerName: client.name, count: result.cards.length });
        sendGameState(client.roomId);
        break;
      }

      case 'OPEN_SEQUENCE': {
        const room = rooms.get(client.roomId);
        if (!room?.game) return;
        const result = room.game.openSequence(client.playerId, msg.cardIds);
        if (result.error) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
        broadcastAll(client.roomId, {
          type: 'ACTION', action: 'OPEN_SEQUENCE',
          playerId: client.playerId, playerName: client.name,
          seqInfo: result.validation
        });
        sendGameState(client.roomId);
        break;
      }

      case 'ADD_TO_SEQUENCE': {
        const room = rooms.get(client.roomId);
        if (!room?.game) return;
        const result = room.game.addToSequence(client.playerId, msg.seqId, msg.cardIds);
        if (result.error) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
        broadcastAll(client.roomId, { type: 'ACTION', action: 'ADD_TO_SEQUENCE', playerId: client.playerId, playerName: client.name });
        sendGameState(client.roomId);
        break;
      }

      case 'DISCARD': {
        const room = rooms.get(client.roomId);
        if (!room?.game) return;
        const result = room.game.discard(client.playerId, msg.cardId, msg.isPut);
        if (result.error) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }

        if (result.gameOver) {
          broadcastAll(client.roomId, {
            type: 'GAME_OVER',
            winnerTeam: result.winnerTeam || room.game.winnerTeam,
            winner: result.winner || client.playerId,
            winnerName: client.name,
            reason: result.reason || (result.put ? 'put' : 'pile_empty')
          });
          room.status = 'ended';
        } else if (result.put) {
          broadcastAll(client.roomId, {
            type: 'ACTION', action: 'PUT',
            playerId: client.playerId, playerName: client.name,
            bukharasLeft: result.bukharasLeft
          });
        } else {
          broadcastAll(client.roomId, {
            type: 'ACTION', action: 'DISCARD',
            playerId: client.playerId, playerName: client.name
          });
        }
        sendGameState(client.roomId);
        break;
      }

      case 'RESTART_GAME': {
        const room = rooms.get(client.roomId);
        if (!room) return;
        if (room.host !== client.playerId) { sendTo(ws, { type: 'ERROR', message: 'Only host can restart' }); return; }
        room.game = new BukharoGame(client.roomId, room.players);
        room.status = 'playing';
        broadcastAll(client.roomId, { type: 'GAME_STARTED', players: room.players, isRestart: true });
        sendGameState(client.roomId);
        break;
      }

      case 'CHAT': {
        broadcastAll(client.roomId, { type: 'CHAT', name: client.name, message: msg.message, time: Date.now() });
        break;
      }
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client?.roomId) {
      const room = rooms.get(client.roomId);
      if (room && room.status === 'lobby') {
        room.players = room.players.filter(p => p.id !== client.playerId);
        if (room.players.length === 0) {
          rooms.delete(client.roomId);
        } else {
          if (room.host === client.playerId) room.host = room.players[0].id;
          broadcastAll(client.roomId, { type: 'LOBBY_UPDATE', players: room.players, host: room.host, roomId: client.roomId });
        }
      } else if (room && room.status === 'playing') {
        broadcast(client.roomId, { type: 'PLAYER_LEFT', name: client.name, playerId: client.playerId });
      }
    }
    clients.delete(ws);
  });
});

// REST: create room via HTTP (for share links)
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.json({ exists: false });
  res.json({ exists: true, status: room.status, playerCount: room.players.length });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Bukharo server running on port ${PORT}`);
});
