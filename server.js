const express = require("express");
const path = require("path");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");

// WebSocket server
const wss = new WebSocket.Server({ server });

// استخدم PORT اللي Railway أو أي خدمة استضافة ترسله
const PORT = process.env.PORT || 3000;

// تقديم الملفات الثابتة (index.html والملفات الأخرى)
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// افتح السيرفر
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
