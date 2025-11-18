const express = require(express);
const http = require(http);
const path = require(path);
const WebSocket = require(ws);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

const ROWS = 6;
const COLS = 7;

const rooms = new Map();  roomCode - { board, players, currentPlayer, gameOver }

function createEmptyBoard() {
  return Array.from({ length ROWS }, () =
    Array.from({ length COLS }, () = null)
  );
}

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      board createEmptyBoard(),
      players [],  {id, name}
      currentPlayer 0,
      gameOver false,
      winnerId null
    });
  }
  return rooms.get(roomCode);
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const payload = JSON.stringify({
    type state,
    roomCode,
    board room.board,
    players room.players,
    currentPlayer room.currentPlayer,
    gameOver room.gameOver,
    winnerId room.winnerId
  });

  wss.clients.forEach(ws = {
    if (ws.readyState === WebSocket.OPEN && ws.roomCode === roomCode) {
      ws.send(payload);
    }
  });
}

function checkWin(board, row, col, playerIndex) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    let r = row + dr;
    let c = col + dc;
    while (
      r = 0 &&
      r  ROWS &&
      c = 0 &&
      c  COLS &&
      board[r][c] === playerIndex
    ) {
      count++;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (
      r = 0 &&
      r  ROWS &&
      c = 0 &&
      c  COLS &&
      board[r][c] === playerIndex
    ) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count = 4) return true;
  }
  return false;
}

function isBoardFull(board) {
  for (let c = 0; c  COLS; c++) {
    if (board[0][c] === null) return false;
  }
  return true;
}

wss.on(connection, ws = {
  ws.on(message, msg = {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.type === join) {
      const { roomCode, name } = data;
      if (!roomCode  !name) return;

      const room = getRoom(roomCode);
      ws.roomCode = roomCode;
      ws.playerId = ws.playerId  Math.random().toString(36).slice(2);

       إذا اللاعب مو موجود أضفه (بحد أقصى 4 لاعبين)
      if (!room.players.find(p = p.id === ws.playerId)) {
        if (room.players.length = 4) {
          ws.send(
            JSON.stringify({
              type error,
              message الغرفة مليانة (حدها 4 لاعبين)
            })
          );
          return;
        }
        room.players.push({
          id ws.playerId,
          name String(name).slice(0, 20)
        });
      } else {
         لو رجع يتصل نحدث اسمه
        room.players = room.players.map(p =
          p.id === ws.playerId  { ...p, name String(name).slice(0, 20) }  p
        );
      }

       لو ما فيه لاعبين أو ما فيها لوحة نعيدها جديدة
      if (!room.board) {
        room.board = createEmptyBoard();
        room.currentPlayer = 0;
        room.gameOver = false;
        room.winnerId = null;
      }

      ws.send(
        JSON.stringify({
          type joined,
          playerId ws.playerId
        })
      );

      broadcastRoom(roomCode);
    }

    if (data.type === move) {
      const { roomCode, col, playerId } = data;
      const room = rooms.get(roomCode);
      if (!room  room.gameOver) return;
      ws.roomCode = roomCode;

      const playerIndex = room.players.findIndex(p = p.id === playerId);
      if (playerIndex === -1) return;
      if (playerIndex !== room.currentPlayer) return;  مو دورك

      if (col  0  col = COLS) return;

      let placedRow = null;
      for (let r = ROWS - 1; r = 0; r--) {
        if (room.board[r][col] === null) {
          room.board[r][col] = playerIndex;
          placedRow = r;
          break;
        }
      }
      if (placedRow === null) return;  العمود فل

      if (checkWin(room.board, placedRow, col, playerIndex)) {
        room.gameOver = true;
        room.winnerId = playerId;
      } else if (isBoardFull(room.board)) {
        room.gameOver = true;
        room.winnerId = null;
      } else {
         نروح للي بعده (من 0 إلى عدد اللاعبين-1)
        const playersCount = room.players.length  1;
        room.currentPlayer = (room.currentPlayer + 1) % playersCount;
      }

      broadcastRoom(roomCode);
    }

    if (data.type === newGame) {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      if (!room) return;

      room.board = createEmptyBoard();
      room.gameOver = false;
      room.winnerId = null;
      room.currentPlayer = 0;

      broadcastRoom(roomCode);
    }
  });

  ws.on(close, () = {
    const roomCode = ws.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter(p = p.id !== ws.playerId);
    if (room.players.length === 0) {
      rooms.delete(roomCode);  ما بقى أحد، نحذف الغرفة
    } else {
       نرتب الدور إذا اللي طلع كان دوره
      room.currentPlayer %= room.players.length;
      broadcastRoom(roomCode);
    }
  });
});

const PORT = process.env.PORT  3000;
server.listen(PORT, () = {
  console.log(Server listening on port, PORT);
});
