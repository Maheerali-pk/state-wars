import geckos from "@geckos.io/client";
import { ClientToServerEvent } from "../types/shared";

const defaultGeckosUrl = `${window.location.protocol}//${window.location.hostname}`;
const defaultGeckosPort = window.location.port
  ? Number(window.location.port)
  : window.location.protocol === "https:"
    ? 443
    : 80;
const geckosUrl = import.meta.env.VITE_GECKOS_URL || defaultGeckosUrl;
const geckosPort = Number(import.meta.env.VITE_GECKOS_PORT || defaultGeckosPort);

export const channel = geckos({ url: geckosUrl, port: geckosPort });

export const sendEventToServer = (event: ClientToServerEvent) => {
  channel.emit("client-to-server", event);
};
