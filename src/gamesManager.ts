import { Game } from "./game";

export class GamesManager {
  private games: Game[] = [];

  constructor() {
    this.games = [];
  }

  public addGame(game: Game) {
    this.games.push(game);
  }

  public removeGame(gameId: string) {
    this.games = this.games.filter((game) => game.id !== gameId);
  }

  public getGame(gameId: string) {
    return this.games.find((game) => game.id === gameId);
  }
  public getGames() {
    return this.games;
  }
}

export const gamesManager = new GamesManager();
