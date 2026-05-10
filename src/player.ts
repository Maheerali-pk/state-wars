import { User } from "../frontend/src/types/shared";

export class UsersManager {
  private users: User[] = [];
  constructor() {
    this.users = [];
  }
  public addUser(user: User) {
    this.users.push(user);
  }
  public removeUser(userId: string) {
    this.users = this.users.filter((user) => user.id !== userId);
  }
  public getUser(userId: string) {
    return this.users.find((user) => user.id === userId);
  }
  public getUsers() {
    return this.users;
  }
}

export const usersManager = new UsersManager();
