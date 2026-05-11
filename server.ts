import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { usersManager } from "./src/player";
import { Game } from "./src/game";
import { io, sendEventAllUsers, sendEventToRoom } from "./src/geckos";
import { ClientToServerEvent, User } from "./frontend/src/types/shared";
import { gamesManager } from "./src/gamesManager";
import { lobbyManager } from "./src/lobbyManager";

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
    lobbyManager.handleUserDisconnect(channel.id || "");
    lobbyManager.cleanLobbies();
    sendEventAllUsers({
      type: "update-lobbies",
      data: lobbyManager.getLobbies(),
    });
    usersManager.removeUser(channel.id || "");
  });
  console.log(`${channel.id} connected to the server`);

  usersManager.addUser({
    id: channel.id || "",
    name: `Player ${usersManager.getUsers().length + 1}`,
  });

  channel.emit("server-to-client", {
    type: "update-lobbies",
    data: lobbyManager.getLobbies(),
  });
  //@ts-ignore
  channel.on("client-to-server", (data: ClientToServerEvent) => {
    if (data.type === "create-lobby") {
      lobbyManager.addLobby({
        id: crypto.randomUUID(),
        userIds: [channel.id || ""],
        hostId: channel.id || "",
      });
      sendEventAllUsers({
        type: "update-lobbies",
        data: lobbyManager.getLobbies(),
      });
    }
    if (data.type === "join-lobby") {
      lobbyManager.joinLobby(data.data.lobbyId, channel.id || "");
      sendEventAllUsers({
        type: "update-lobbies",
        data: lobbyManager.getLobbies(),
      });
    }
    if (data.type === "start-lobby-game") {
      const lobby = lobbyManager.getLobby(data.data.lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== channel.id) return;
      const users = lobby.userIds.map((userId) => usersManager.getUser(userId) as User);
      const gameId = crypto.randomUUID();
      const connections = users.map((user) => io.connectionsManager.getConnection(user.id));
      connections.forEach((connection) => {
        connection?.channel.join(gameId);
      });
      const game = new Game(users, gameId);
      gamesManager.addGame(game);
      console.log(`Game started with id ${gameId}`);
      console.log(`Users: ${users.map((user) => user.name).join(", ")}`);
      lobbyManager.removeLobby(lobby.id);
      sendEventAllUsers({
        type: "update-lobbies",
        data: lobbyManager.getLobbies(),
      });
    }

    if (data.type === "create-unit-movement") {
      console.log("create-unit-movement called", JSON.stringify(data, null, 2));
    }
  });
});
