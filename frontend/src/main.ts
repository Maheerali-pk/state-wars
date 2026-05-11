import { GameState } from "./game";
import { channel, sendEventToServer } from "./helpers/geckos-client";
import { Lobby, ServerToClientEvent } from "./types/shared";

let lobbies: Lobby[] = [];
let currentLobby: Lobby | null = null;
let isInGame = false;

const mainPage = document.getElementById("main-page");
const lobbyPage = document.getElementById("lobby-page");
const pixiContainer = document.getElementById("pixi-container");
const createLobbyBtn = document.getElementById("create-lobby-btn");
const startLobbyBtn = document.getElementById("start-lobby-btn");
const lobbyList = document.getElementById("lobby-list");
const lobbyTitle = document.getElementById("lobby-title");
const lobbyUsersList = document.getElementById("lobby-users-list");

const setView = (view: "main" | "lobby" | "game") => {
  mainPage?.classList.toggle("hidden", view !== "main");
  lobbyPage?.classList.toggle("hidden", view !== "lobby");
  pixiContainer?.classList.toggle("hidden", view !== "game");
};

const renderLobbyListPage = () => {
  if (!lobbyList) return;

  setView("main");
  lobbyList.replaceChildren(
    ...lobbies.map((lobby) => {
      const item = document.createElement("li");
      const lobbyInfo = document.createElement("span");
      lobbyInfo.textContent = `${lobby.id} (${lobby.userIds.length} players) `;

      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Join";
      joinBtn.addEventListener("click", () => {
        sendEventToServer({ type: "join-lobby", data: { lobbyId: lobby.id } });
      });

      item.appendChild(lobbyInfo);
      item.appendChild(joinBtn);
      return item;
    }),
  );
};

const renderInsideLobbyPage = () => {
  if (!currentLobby || !lobbyTitle || !lobbyUsersList) return;
  const isHost = currentLobby.hostId === (channel.id || "");

  setView("lobby");
  lobbyTitle.textContent = `Lobby ${currentLobby.id}`;
  lobbyUsersList.replaceChildren(
    ...currentLobby.userIds.map((userId) => {
      const item = document.createElement("li");
      item.textContent = userId;
      return item;
    }),
  );
  startLobbyBtn?.classList.toggle("hidden", !isHost);
};
startLobbyBtn?.addEventListener("click", () => {
  sendEventToServer({ type: "start-lobby-game", data: { lobbyId: currentLobby?.id || "" } });
});

const renderCurrentPage = () => {
  if (isInGame) {
    setView("game");
    return;
  }

  if (currentLobby) {
    renderInsideLobbyPage();
    return;
  }

  renderLobbyListPage();
};

channel.onConnect((error) => {
  if (error) {
    console.error(error.message);
    return;
  }

  //@ts-ignore
  channel.on("server-to-client", (event: ServerToClientEvent) => {
    if (event.type === "game-started") {
      console.log(`Game started with id ${event.data.id}`);
      isInGame = true;
      setView("game");
      new GameState(event.data.id, event.data.players);
    }
    if (event.type === "update-lobbies") {
      lobbies = event.data;
      currentLobby = lobbies.find((lobby) => lobby.userIds.includes(channel.id || "")) || null;
      if (!isInGame) {
        renderCurrentPage();
      }
    }
  });

  createLobbyBtn?.addEventListener("click", () => {
    sendEventToServer({ type: "create-lobby" });
  });

  renderCurrentPage();
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
