import geckos from "@geckos.io/client";
import { ClientToServerEvent } from "../types/shared";

const geckosUrl = import.meta.env.VITE_GECKOS_URL || "https://statewars.mulgames.com";
const geckosPort = Number(import.meta.env.VITE_GECKOS_PORT || 443);

// export const channel = geckos({ url: geckosUrl, port: geckosPort });
export const channel = geckos({ port: 5001 });

export const sendEventToServer = (event: ClientToServerEvent) => {
  channel.emit("client-to-server", event);
};
