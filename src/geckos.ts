import { geckos } from "@geckos.io/server";
import { ServerToClientEvent } from "../frontend/src/types/shared";

export const io = geckos();

export const sendEventToRoom = (roomId: string, data: ServerToClientEvent) => {
  io.room(roomId).emit("server-to-client", data);
};

export const sendEventAllUsers = (data: ServerToClientEvent) => {
  io.emit("server-to-client", data);
};
