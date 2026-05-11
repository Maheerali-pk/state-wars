import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { usersManager } from "./src/player";
import { Game } from "./src/game";
import { io } from "./src/geckos";
import { ClientToServerEvent } from "./frontend/src/types/shared";
import { gamesManager } from "./src/gamesManager";

const app = express();
const port = Number(process.env.PORT || 5001);
const frontendDistPath = path.join(__dirname, "frontend", "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    message: "StateIO API + geckos server is running",
  });
});

app.get("/api/health/geckos", (_req, res) => {
  const activeConnections = io.connectionsManager.getConnections().size;
  res.json({
    status: "ok",
    geckos: {
      activeConnections,
    },
  });
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else {
  app.get("/", (_req, res) => {
    res.status(503).json({
      status: "error",
      message: "Frontend build not found. Run `npm run build:frontend` first.",
    });
  });
}

const server = http.createServer(app);
io.addServer(server);

server.listen(port, () => {
  console.log(`HTTP + geckos listening on http://localhost:${port}`);
});

io.onConnection((channel) => {
  channel.onDisconnect(() => {
    console.log(`${channel.id} got disconnected`);
    usersManager.removeUser(channel.id || "");
  });
  console.log(`${channel.id} connected to the server`);

  //@ts-ignore
  channel.on("client-to-server", (data: ClientToServerEvent) => {
    if (data.type === "joined-queue") {
      usersManager.addUser({
        id: channel.id || "",
        name: `Player ${usersManager.getUsers().length + 1}`,
      });
      const allUsers = usersManager.getUsers();
      const allGames = gamesManager.getGames();

      const playersWithoutGame = allUsers.filter(
        (user) =>
          !allGames.some((game) => game.players.some((player) => player.userId === user.id)),
      );

      if (playersWithoutGame.length === 2) {
        const users = usersManager.getUsers();
        const con1 = io.connectionsManager.getConnection(users[0].id);
        const con2 = io.connectionsManager.getConnection(users[1].id);
        const gameId = crypto.randomUUID();
        if (con1 && con2) {
          con1.channel.join(gameId);
          con2.channel.join(gameId);
        }
        const game = new Game(users, gameId);
        gamesManager.addGame(game);
      }
      console.log(`${channel.id} joined the game`);
    }
    if (data.type === "create-unit-movement") {
      console.log("create-unit-movement called", JSON.stringify(data, null, 2));
    }
  });
});
