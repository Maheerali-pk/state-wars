import geckos from "@geckos.io/server";
import worldData from "./src/data/all-data.json";
import { FeatureCollection } from "geojson";
import { usersManager } from "./src/player";
import { Game } from "./src/game";
import { io, sendEventToRoom } from "./src/geckos";
import { ClientToServerEvent } from "./frontend/src/types/shared";
import { gamesManager } from "./src/gamesManager";

io.listen(5000); // default port is 9208

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
