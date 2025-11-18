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

/**
 * rooms:
 *  roomCode -> {
 *    board: 2D array of "A" | "B" | null,
 *    players: [{ id, name, team: "A" | "B" }],
 *    turnTeam: "A" | "B",
 *    gameOver: boolean,
 *    winnerTeam: "A" | "B" | null
 *  }
 */
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
      players: [],
      turnTeam: "A", // يبدأ فريق الأزرق
      gameOver: false,
      winnerTeam: null
    });
  }
  return rooms.get(code);
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function broadcastRoom(code) {
  const room = rooms.get(code);
  if (!room) return;

  const payload = JSON.stringify({
    type: "state",
    roomCode: code,
    board: room.board,
    players: room.players,
    turnTeam: room.turnTeam,
    gameOver: room.gameOver,
    winnerTeam: room.winnerTeam
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

function checkWin(board, row, col, team) {
  const dirs = [
    [1, 0],  // عمودي
    [0, 1],  // أفقي
    [1, 1],  // قطري /
    [1, -1]  // قطري \
  ];

  for (const [dr, dc] of dirs) {
    let count = 1;

    // اتجاه أول
    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      board[r][c] === team
    ) {
      count++;
      r += dr;
      c += dc;
    }

    // الاتجاه الثاني
    r = row - dr;
    c = col - dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      board[r][c] === team
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

wss.on("connection", (ws) => {
  ws.id = randomId(); // هوية اللاعب على هذا الاتصال

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    // الانضمام لروم
    if (data.type === "join") {
      const { roomCode, name, team } = data;
      if (!roomCode || !name || (team !== "A" && team !== "B")) return;

      const code = String(roomCode).toUpperCase();
      const room = getRoom(code);
      ws.roomCode = code;

      // حد أقصى 4 لاعبين لكل فريق
      const teamCount = room.players.filter((p) => p.team === team).length;
      if (teamCount >= 4) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "هذا الفريق مليان (4 لاعبين كحد أقصى)"
          })
        );
        return;
      }

      // حد أقصى 8 لاعبين في الروم كله
      if (!room.players.find((p) => p.id === ws.id) && room.players.length >= 8) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "الغرفة مليانة (8 لاعبين كحد أقصى)"
          })
        );
        return;
      }

      // إضافة / تحديث اللاعب
      let player = room.players.find((p) => p.id === ws.id);
      if (!player) {
        player = {
          id: ws.id,
          name: String(name).slice(0, 20),
          team
        };
        room.players.push(player);
      } else {
        player.name = String(name).slice(0, 20);
        player.team = team;
      }

      // نرسل له أنه انضم (لو حاب تستخدمه في الواجهة)
      ws.send(
        JSON.stringify({
          type: "joined",
          playerId: ws.id
        })
      );

      broadcastRoom(code);
    }

    // حركة في عمود
    if (data.type === "move") {
      const { roomCode, col } = data;
      const code = roomCode ? String(roomCode).toUpperCase() : ws.roomCode;
      const room = rooms.get(code);
      if (!room || room.gameOver) return;

      // نحدد اللاعب من ws.id وليس من playerId من الكلاينت
      const player = room.players.find((p) => p.id === ws.id);
      if (!player) return;

      // لازم يكون دور فريقه
      if (player.team !== room.turnTeam) return;

      if (typeof col !== "number" || col < 0 || col >= COLS) return;

      let placedRow = null;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (room.board[r][col] === null) {
          room.board[r][col] = player.team; // "A" أو "B"
          placedRow = r;
          break;
        }
      }
      if (placedRow === null) return; // العمود مليان

      if (checkWin(room.board, placedRow, col, player.team)) {
        room.gameOver = true;
        room.winnerTeam = player.team;
      } else if (isBoardFull(room.board)) {
        room.gameOver = true;
        room.winnerTeam = null; // تعادل
      } else {
        room.turnTeam = room.turnTeam === "A" ? "B" : "A";
      }

      broadcastRoom(code);
    }

    // لعبة جديدة
    if (data.type === "newGame") {
      const { roomCode } = data;
      const code = roomCode ? String(roomCode).toUpperCase() : ws.roomCode;
      const room = rooms.get(code);
      if (!room) return;

      room.board = createEmptyBoard();
      room.turnTeam = "A";
      room.gameOver = false;
      room.winnerTeam = null;

      broadcastRoom(code);
    }
  });

  ws.on("close", () => {
    const code = ws.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== ws.id);

    if (room.players.length === 0) {
      rooms.delete(code);
    } else {
      broadcastRoom(code);
    }
  });
});

// تقديم ملفات الموقع
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// بورت Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
