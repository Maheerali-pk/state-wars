import geckos, { ClientChannel } from "@geckos.io/client";
import { ClientToServerEvent, ServerToClientEvent } from "../types/shared";
import { GameState } from "../game";

export const channel = geckos({ port: 5000 }); // default port is 9208

export const sendEventToServer = (event: ClientToServerEvent) => {
  channel.emit("client-to-server", event);
};
