import { GameState } from "./game";
import { channel, sendEventToServer } from "./helpers/geckos-client";
import { ServerToClientEvent } from "./types/shared";

channel.onConnect((error) => {
  if (error) {
    console.error(error.message);
    return;
  }
  sendEventToServer({ type: "joined-queue" });

  //@ts-ignore
  channel.on("server-to-client", (event: ServerToClientEvent) => {
    if (event.type === "game-started") {
      console.log(`Game started with id ${event.data.id}`);
      const game = new GameState(event.data.id, event.data.players);
    }
  });
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
