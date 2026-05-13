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
const lobbySubtitle = document.getElementById("lobby-subtitle");
const lobbyUsersList = document.getElementById("lobby-users-list");
const connectionStatus = document.getElementById("connection-status");
const playerCountBadge = document.getElementById("player-count-badge");
const lobbyWaitingText = document.getElementById("lobby-waiting-text");

const setView = (view: "main" | "lobby" | "game") => {
  mainPage?.classList.toggle("hidden", view !== "main");
  lobbyPage?.classList.toggle("hidden", view !== "lobby");
  pixiContainer?.classList.toggle("hidden", view !== "game");
};

const renderLobbyListPage = () => {
  if (!lobbyList) return;

  setView("main");
  if (lobbies.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No active lobbies. Create one to start the action.";
    lobbyList.replaceChildren(emptyState);
    return;
  }

  lobbyList.replaceChildren(
    ...lobbies.map((lobby) => {
      const item = document.createElement("li");
      item.className = "lobby-item";

      const infoWrap = document.createElement("div");
      infoWrap.className = "lobby-info";

      const lobbyName = document.createElement("p");
      lobbyName.className = "lobby-name";
      lobbyName.textContent = `Lobby ${lobby.id}`;

      const lobbyMeta = document.createElement("p");
      lobbyMeta.className = "lobby-meta";
      lobbyMeta.textContent = `${lobby.userIds.length} players online`;

      infoWrap.append(lobbyName, lobbyMeta);

      const joinBtn = document.createElement("button");
      joinBtn.className = "btn btn-secondary";
      joinBtn.textContent = "Join";
      joinBtn.addEventListener("click", () => {
        sendEventToServer({ type: "join-lobby", data: { lobbyId: lobby.id } });
      });

      item.append(infoWrap, joinBtn);
      return item;
    }),
  );
};

const renderInsideLobbyPage = () => {
  if (!currentLobby || !lobbyTitle || !lobbyUsersList) return;
  const lobby = currentLobby;
  const isHost = lobby.hostId === (channel.id || "");

  setView("lobby");
  lobbyTitle.textContent = `Lobby ${lobby.id}`;
  if (lobbySubtitle) {
    lobbySubtitle.textContent = isHost
      ? "You are the host. Start when everyone is ready."
      : "Host will launch the match once everyone is ready.";
  }
  if (playerCountBadge) {
    playerCountBadge.textContent = `${lobby.userIds.length} players`;
  }
  lobbyUsersList.replaceChildren(
    ...lobby.userIds.map((userId) => {
      const item = document.createElement("li");
      item.className = "player-item";

      const userText = document.createElement("span");
      userText.textContent = userId;

      const roleBadge = document.createElement("span");
      roleBadge.className = "pill";
      if (userId === lobby.hostId) {
        roleBadge.textContent = "Host";
      } else if (userId === channel.id) {
        roleBadge.textContent = "You";
      } else {
        roleBadge.textContent = "Player";
      }

      item.append(userText, roleBadge);
      return item;
    }),
  );
  if (lobbyWaitingText) {
    lobbyWaitingText.textContent = isHost
      ? "Press start when all players are in."
      : "Waiting for host to start.";
  }
  startLobbyBtn?.classList.toggle("hidden", !isHost);
};
startLobbyBtn?.addEventListener("click", () => {
  sendEventToServer({
    type: "start-lobby-game",
    data: { lobbyId: currentLobby?.id || "" },
  });
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
    if (connectionStatus) connectionStatus.textContent = "Connection failed";
    return;
  }
  if (connectionStatus) connectionStatus.textContent = "Connected";

  // @ts-expect-error geckos event typing is not narrowed for custom payload
  channel.on("server-to-client", (event: ServerToClientEvent) => {
    if (event.type === "game-started") {
      console.log(`Game started with id ${event.data.id}`);
      isInGame = true;
      setView("game");
      new GameState(event.data.id, event.data.players);
    }
    if (event.type === "update-lobbies") {
      lobbies = event.data;
      currentLobby =
        lobbies.find((lobby) => lobby.userIds.includes(channel.id || "")) ||
        null;
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
