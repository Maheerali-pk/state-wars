import { Lobby } from "../frontend/src/types/shared";

export class LobbyManager {
  private lobbies: Lobby[] = [];

  constructor() {
    this.lobbies = [];
  }
  public addLobby(lobby: Lobby) {
    this.lobbies.push(lobby);
  }
  public removeLobby(lobbyId: string) {
    this.lobbies = this.lobbies.filter((lobby) => lobby.id !== lobbyId);
  }
  public getLobby(lobbyId: string) {
    return this.lobbies.find((lobby) => lobby.id === lobbyId);
  }
  public getLobbies() {
    return this.lobbies;
  }
  public getLobbyByUserId(userId: string) {
    return this.lobbies.find((lobby) => lobby.userIds.includes(userId));
  }
  public removeUserFromLobby(lobbyId: string, userId: string) {
    const lobby = this.getLobby(lobbyId);
    if (!lobby) return;
    lobby.userIds = lobby.userIds.filter((userId) => userId !== userId);
  }
  public handleUserDisconnect(userId: string) {
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby) return;
    this.removeUserFromLobby(lobby.id, userId);
  }
  public cleanLobbies() {
    this.lobbies = this.lobbies.filter((lobby) => lobby.userIds.length > 0);
  }
  public joinLobby(lobbyId: string, userId: string) {
    const lobby = this.getLobby(lobbyId);
    if (!lobby) return;
    lobby.userIds.push(userId);
  }
}
export const lobbyManager = new LobbyManager();
