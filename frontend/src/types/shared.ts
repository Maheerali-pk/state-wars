import { Graphics } from "pixi.js";

export interface Player {
  name: string;
  id: string;
  colors: PlayerColors;
  coin: number;
}
export interface PlayerColors {
  stateBackground: string;
  unitMarker: string;
  unit: string;
  basic: string;
}

export interface MovingUnitDetails {
  position: {
    x: number;
    y: number;
  };
  destination: {
    x: number;
    y: number;
  };
  speed: number;
}

export interface Unit {
  playerId: string;
  movingDetails?: MovingUnitDetails;
  stateId?: string;
  graphics: Graphics;
  lastMovedTimestamp: number;
  firstRenderAt: number;
  destinationStateId?: string;
  destroyed: boolean;

  destinationCircle: { x: number; y: number; radius: number };
}
export interface PickingStateDetails {
  currentPlayerId: string;
  picksRemaining: number;
  isActive: boolean;
}

type JoinedQueueEvent = {
  type: "joined-queue";
};
type CreateUnitMovementEvent = {
  type: "create-unit-movement";
  data: { attackerStateId: string; defenderStateId: string; unitCount: number };
};
type UpgradeStateEvent = {
  type: "upgrade-state";
  data: { stateId: string };
};
type PickStateEvent = {
  type: "pick-state";
  data: { stateId: string; playerId: string };
};

type CreateLobbyEvent = {
  type: "create-lobby";
};

type JoinLobbyEvent = {
  type: "join-lobby";
  data: { lobbyId: string };
};
type StartLobbyGameEvent = {
  type: "start-lobby-game";
  data: { lobbyId: string };
};
type ClientPingEvent = {
  type: "ping";
  data: { sentAt: number };
};
export type ClientToServerEvent =
  | JoinedQueueEvent
  | CreateUnitMovementEvent
  | UpgradeStateEvent
  | CreateLobbyEvent
  | JoinLobbyEvent
  | PickStateEvent
  | StartLobbyGameEvent
  | ClientPingEvent;

type UpdateStatesEvent = {
  type: "update-states";
  data: BackendState[];
};
type UpdateBatchMovementsEvent = {
  type: "update-batch-movements";
  data: BatchMovement[];
};
type GameStartedEvent = {
  type: "game-started";
  data: { id: string; players: Player[] };
};
type UpdateUnitCountsEvent = {
  type: "update-unit-counts";
  data: { stateId: string; unitCount: number }[];
};
type UpdateStateOwnerChangesEvent = {
  type: "update-state-owner-changes";
  data: { id: string; ownerId: string }[];
};
type UpdateGoldCount = {
  type: "update-gold-count";
  data: { playerId: string; goldCount: number }[];
};
type SendPickingStateDetailsEvent = {
  type: "send-picking-state-details";
  data: PickingStateDetails;
};
type UpdateLobbiesEvent = {
  type: "update-lobbies";
  data: Lobby[];
};
type ServerPongEvent = {
  type: "pong";
  data: { sentAt: number };
};
export type ServerToClientEvent =
  | UpdateStatesEvent
  | UpdateBatchMovementsEvent
  | GameStartedEvent
  | UpdateUnitCountsEvent
  | UpdateStateOwnerChangesEvent
  | UpdateGoldCount
  | UpdateLobbiesEvent
  | SendPickingStateDetailsEvent
  | ServerPongEvent;

export interface BackendState {
  id: string;
  ownerId: string;
  unitCount: number;
  level: number;
  unitIncreaseTime: number;
  lastUnitIncreaseTimestamp: number;
  centerPoint: { x: number; y: number };
  baseIncome: number;
}
export interface BatchMovement {
  id: string;
  ownerId: string;
  fromStateId: string;
  toStateId: string;
  amount: number;
  startTime: number;
  arrivalTime: number;
  unitsCollided: number;
}

export interface BackendPlayer {
  userId: string;
  name: string;
  color: PlayerColors;
  goldCount: number;
}
export interface User {
  id: string;
  name: string;
}

export interface Lobby {
  id: string;
  userIds: string[];
  hostId: string;
}
