const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

// WebSocket على مسار /ws
const wss = new WebSocket.Server({ server, path: "/ws" });

const ROWS = 6;
const COLS = 7;

// roomCode -> { board, players, current, gameOver, winnerId }
const rooms = new Map();

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null)
  );
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      board: createEmptyBoard(),
      players: [], // {id, name}
      current: 0,
      gameOver: false,
      winnerId: null
    });
  }
  return rooms.get(code);
}

function broadcastRoom(code) {
  const room = rooms.get(code);
  if (!room) return;

  const payload = JSON.stringify({
    type: "state",
    roomCode: code,
    board: room.board,
    players: room.players,
    current: room.current,
    gameOver: room.gameOver,
    winnerId: room.winnerId
  });

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.roomCode === code
    ) {
      client.send(payload);
    }
  });
}

function checkWin(board, row, col, playerIndex) {
  const dirs = [
    [1, 0],  // عمودي
    [0, 1],  // أفقي
    [1, 1],  // قطري /
    [1, -1]  // قطري \
  ];

  for (const [dr, dc] of dirs) {
    let count = 1;

    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      board[r][c] === playerIndex
    ) {
      count++;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      board[r][c] === playerIndex
    ) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= 4) return true;
  }

  return false;
}

function isBoardFull(board) {
  return board[0].every((cell) => cell !== null);
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// WebSocket logic
wss.on("connection", (ws) => {
  ws.id = randomId();

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.type === "join") {
      const { roomCode, name } = data;
      if (!roomCode || !name) return;

      const room = getRoom(roomCode);
      ws.roomCode = roomCode;

      // هل اللاعب موجود؟
      let player = room.players.find((p) => p.id === ws.id);
      if (!player) {
        if (room.players.length >= 4) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "الغرفة مليانة (الحد 4 لاعبين)"
            })
          );
          return;
        }
        player = { id: ws.id, name: String(name).slice(0, 20) };
        room.players.push(player);
      } else {
        player.name = String(name).slice(0, 20);
      }

      ws.send(
        JSON.stringify({
          type: "joined",
          playerId: ws.id
        })
      );

      broadcastRoom(roomCode);
    }

        // حركة في العمود     if (data.type === "move") {       const { roomCode, col } = data;      // ما نحتاج playerId هنا       const room = rooms.get(roomCode);       if (!room || room.gameOver) return;        // نجيب اللاعب من الـ ws.id نفسه       const player = room.players.find((p) => p.id === ws.id);       if (!player) return;        // لازم يكون دور فريقه       if (player.team !== room.turnTeam) return;        if (col < 0 || col >= COLS) return;        let placedRow = null;       for (let r = ROWS - 1; r >= 0; r--) {         if (room.board[r][col] === null) {           room.board[r][col] = player.team; // نخزن الفريق A أو B           placedRow = r;           break;         }       }       if (placedRow === null) return; // العمود مليان        if (checkWin(room.board, placedRow, col, player.team)) {         room.gameOver = true;         room.winnerTeam = player.team;       } else if (isBoardFull(room.board)) {         room.gameOver = true;         room.winnerTeam = null; // تعادل       } else {         room.turnTeam = room.turnTeam === "A" ? "B" : "A";       }        broadcastRoom(roomCode);     }
      const { roomCode, col, playerId } = data;
      const room = rooms.get(roomCode);
      if (!room || room.gameOver) return;

      const playerIndex = room.players.findIndex((p) => p.id === playerId);
      if (playerIndex === -1) return;
      if (playerIndex !== room.current) return; // مو دورك

      if (col < 0 || col >= COLS) return;

      let placedRow = null;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (room.board[r][col] === null) {
          room.board[r][col] = playerIndex;
          placedRow = r;
          break;
        }
      }
      if (placedRow === null) return; // العمود مليان

      if (checkWin(room.board, placedRow, col, playerIndex)) {
        room.gameOver = true;
        room.winnerId = playerId;
      } else if (isBoardFull(room.board)) {
        room.gameOver = true;
        room.winnerId = null; // تعادل
      } else {
        const count = room.players.length || 1;
        room.current = (room.current + 1) % count;
      }

      broadcastRoom(roomCode);
    }

    if (data.type === "newGame") {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      if (!room) return;

      room.board = createEmptyBoard();
      room.current = 0;
      room.gameOver = false;
      room.winnerId = null;

      broadcastRoom(roomCode);
    }
  });

  ws.on("close", () => {
    const roomCode = ws.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== ws.id);
    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
      room.current %= room.players.length;
      broadcastRoom(roomCode);
    }
  });
});

// تقديم ملفات الموقع
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// لازم نستخدم PORT من Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
