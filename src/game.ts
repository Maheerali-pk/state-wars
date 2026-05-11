import worldData from "./data/all-data.json";
import { FeatureCollection, Geometry } from "geojson";
import { io, sendEventToRoom } from "./geckos";
import {
  BackendPlayer,
  BackendState,
  ClientToServerEvent,
  PickingStateDetails,
  ServerToClientEvent,
} from "../frontend/src/types/shared";
import { BatchMovement } from "../frontend/src/types/shared";
import { User } from "../frontend/src/types/shared";
import { channel } from "../frontend/src/helpers/geckos-client";
import { getRandomNumber } from "./utils";
const mapData = worldData as FeatureCollection;

interface PlayerColors {
  stateBackground: string;
  unitMarker: string;
  unit: string;
  basic: string;
}

const PLAYER_COLORS: PlayerColors[] = [
  { stateBackground: "#7BB1FE", unitMarker: "#2F5FB3", unit: "#1E4FAF", basic: "#4D8DFF" },
  { stateBackground: "#F49A92", unitMarker: "#B9382F", unit: "#9F2E28", basic: "#E85B52" },
  { stateBackground: "#8DD0A0", unitMarker: "#2E7D4F", unit: "#2B6E3E", basic: "#4CAF6A" },
  { stateBackground: "#BEABE0", unitMarker: "#6B46C1", unit: "#4F2FA6", basic: "#8B5CF6" },
  { stateBackground: "#F7B76A", unitMarker: "#C05621", unit: "#9A4F12", basic: "#ED8936" },
  { stateBackground: "#88E9F8", unitMarker: "#0E7490", unit: "#0B6174", basic: "#06B6D4" },
  { stateBackground: "#F9B5DA", unitMarker: "#BE185D", unit: "#9D1F63", basic: "#EC4899" },
  { stateBackground: "#FDEBA1", unitMarker: "#B7791F", unit: "#9A7300", basic: "#FACC15" },
];

const dummyInitialStates: { ownerIndex: number; states: number[] }[] = [];

// Keep backend timing model aligned with frontend movement logic.
const FRONTEND_UNIT_STEP = 0.1;
const FRONTEND_UNIT_MOVE_INTERVAL_MS = 10;
const FRONTEND_CHUNK_SIZE = 5;
const FRONTEND_CHUNK_DELAY_MS = 150;
const EXPECTED_FRONTEND_FRAME_MS = 16.67;
const NETWORK_BUFFER_MS = 60;

const LEVEL_TO_UNIT_INCREASE_INTERVAL_MS = [5000, 3000, 1500, 750];
const GOLD_COUNT_PER_LEVEL = [250, 500, 1000];

const INITIAL_GOLD_COUNT = 100;
const BATCH_MOVEMENT_COST = 25;

const TOTAL_PICKS = 1;
export class Game {
  public id: string;
  public states: BackendState[] = [];
  public players: BackendPlayer[] = [];
  private batchMovements: BatchMovement[] = [];
  private pickingStateDetails: PickingStateDetails;

  constructor(users: User[], id: string) {
    this.id = id;
    this.players = users.map((user, i) => ({
      userId: user.id,
      name: user.name,
      color: PLAYER_COLORS[i],
      goldCount: INITIAL_GOLD_COUNT,
    }));
    this.pickingStateDetails = {
      currentPlayerId: this.players[0].userId,
      picksRemaining: TOTAL_PICKS,
      isActive: true,
    };
    this.init();
  }

  private getFirstUnitTravelTimeMs(distance: number): number {
    const effectiveStepMs = Math.max(FRONTEND_UNIT_MOVE_INTERVAL_MS, EXPECTED_FRONTEND_FRAME_MS);
    return (distance / FRONTEND_UNIT_STEP) * effectiveStepMs + NETWORK_BUFFER_MS;
  }

  private updateUnitCollisions() {
    const now = Date.now();
    const stateOwnerChanges: string[] = [];
    const unitChanges: { stateId: string; unitCount: number }[] = [];
    for (const batchMovement of this.batchMovements) {
      const toState = this.states.find((state) => state.id === batchMovement.toStateId);
      if (!toState) continue;
      if (now < batchMovement.arrivalTime) continue;

      // First chunk lands at arrivalTime, then every FRONTEND_CHUNK_DELAY_MS.
      const elapsedSinceArrival = now - batchMovement.arrivalTime;
      const landedChunks = 1 + Math.floor(elapsedSinceArrival / FRONTEND_CHUNK_DELAY_MS);
      const shouldHaveCollided = Math.min(batchMovement.amount, landedChunks * FRONTEND_CHUNK_SIZE);
      const newCollisions = shouldHaveCollided - batchMovement.unitsCollided;

      if (newCollisions > 0) {
        if (toState.ownerId === batchMovement.ownerId) {
          toState.unitCount += newCollisions;
        } else {
          toState.unitCount -= newCollisions;
          if (toState.unitCount < 0) {
            toState.ownerId = batchMovement.ownerId;
            stateOwnerChanges.push(batchMovement.toStateId);
            toState.unitCount = Math.abs(toState.unitCount);
          }
        }

        batchMovement.unitsCollided += newCollisions;
        unitChanges.push({ stateId: batchMovement.toStateId, unitCount: toState.unitCount });
      }
    }

    sendEventToRoom(this.id, {
      type: "update-state-owner-changes",
      data: this.states
        .filter((state) => stateOwnerChanges.includes(state.id))
        .map((state) => ({ id: state.id, ownerId: state.ownerId })),
    });
    sendEventToRoom(this.id, {
      type: "update-unit-counts",
      data: unitChanges,
    });
    this.batchMovements = this.batchMovements.filter(
      (batchMovement) => batchMovement.unitsCollided <= batchMovement.amount,
    );
  }

  private createBatchMovement(fromStateId: string, toStateId: string, amount: number) {
    const fromState = this.states.find((state) => state.id === fromStateId);
    const toState = this.states.find((state) => state.id === toStateId);
    const attackingPlayer = this.players.find((player) => player.userId === fromState?.ownerId);
    if (!fromState || !toState) return;
    const distance =
      Math.sqrt(
        (fromState.centerPoint.x - toState.centerPoint.x) ** 2 +
          (fromState.centerPoint.y - toState.centerPoint.y) ** 2,
      ) - 2;
    const timeTaken = this.getFirstUnitTravelTimeMs(distance);
    console.log("First unit travel time (ms)", timeTaken);

    const batchMovement: BatchMovement = {
      id: crypto.randomUUID(),
      unitsCollided: 0,
      ownerId: fromState.ownerId,
      fromStateId: fromStateId,
      toStateId: toStateId,
      amount: amount,
      startTime: Date.now(),
      arrivalTime: Date.now() + timeTaken,
    };
    this.batchMovements.push(batchMovement);
    console.log("first arrival in seconds", timeTaken / 1000);
    fromState.unitCount -= amount;

    if (attackingPlayer) {
      attackingPlayer.goldCount -= BATCH_MOVEMENT_COST;
      this.sendGoldCountOfAllPlayersToClient();
    }
    sendEventToRoom(this.id, {
      type: "update-unit-counts",
      data: [{ stateId: fromStateId, unitCount: fromState.unitCount }],
    });
    sendEventToRoom(this.id, { type: "update-batch-movements", data: [batchMovement] });
  }
  private getPolygonCentroid(ring: number[][]): { x: number; y: number; area: number } {
    let a = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < ring.length; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[(i + 1) % ring.length];
      const x1 = (lon1 + 180) * 4;
      const y1 = (90 - lat1) * 4;
      const x2 = (lon2 + 180) * 4;
      const y2 = (90 - lat2) * 4;
      const cross = x1 * y2 - x2 * y1;
      a += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }

    a *= 0.5;
    if (Math.abs(a) < 1e-8) return { x: 0, y: 0, area: 0 };
    return { x: cx / (6 * a), y: cy / (6 * a), area: Math.abs(a) };
  }
  private getLabelPoint(geometry: Geometry): { x: number; y: number } {
    // Use only outer ring (index 0), ignore holes for label placement.
    const candidates: { x: number; y: number; area: number }[] = [];

    if (geometry.type === "Polygon") {
      candidates.push(this.getPolygonCentroid(geometry.coordinates[0]));
    } else if (geometry.type === "MultiPolygon") {
      for (const poly of geometry.coordinates) {
        candidates.push(this.getPolygonCentroid(poly[0]));
      }
    }

    candidates.sort((a, b) => b.area - a.area);
    return { x: candidates[0]?.x ?? 0, y: candidates[0]?.y ?? 0 };
  }

  private loadStates() {
    this.states = mapData.features
      .filter((feature) => feature.properties?.["CONTINENT"] === "Africa")
      .map((feature, i) => {
        const ownerIndex = dummyInitialStates.find((item) => item.states.includes(i))?.ownerIndex;
        const ownerId = this.players[ownerIndex ?? -1]?.userId || "-1";
        const level = ownerId === "-1" ? 0 : 2;
        return {
          id: i.toString(),
          level: level,
          ownerId: this.players[ownerIndex ?? -1]?.userId || "-1",
          unitCount: ownerId === "-1" ? 5 : 8,
          unitIncreaseTime: LEVEL_TO_UNIT_INCREASE_INTERVAL_MS[level],
          lastUnitIncreaseTimestamp: Date.now(),
          centerPoint: feature.geometry ? this.getLabelPoint(feature.geometry) : { x: 0, y: 0 },
          baseIncome: ownerId === "-1" ? getRandomNumber(10, 80) : 40,
        };
      });

    sendEventToRoom(this.id, {
      type: "update-states",
      data: this.states,
    });
  }

  private updateUnitCountsOnBackend() {
    this.updateUnitCollisions();
    this.states.forEach((state) => {
      if (Date.now() - state.lastUnitIncreaseTimestamp < state.unitIncreaseTime) return;
      state.unitCount++;
      state.lastUnitIncreaseTimestamp = Date.now();
    });
  }
  private sendOccupiedStatesUnitCountsToClient() {
    sendEventToRoom(this.id, {
      type: "update-unit-counts",
      data: this.states
        .filter((state) => state.ownerId !== "-1")
        .map((state) => ({ stateId: state.id, unitCount: state.unitCount })),
    });
  }
  private sendAllStatesUnitCountsToClient() {
    sendEventToRoom(this.id, {
      type: "update-unit-counts",
      data: this.states.map((state) => ({ stateId: state.id, unitCount: state.unitCount })),
    });
  }
  public upgradeState(stateId: string) {
    const state = this.states.find((state) => state.id === stateId);
    const player = this.players.find((player) => player.userId === state?.ownerId);
    if (!state) return;
    if (!player) return;
    player.goldCount -= GOLD_COUNT_PER_LEVEL[state.level];
    state.level++;
    state.unitIncreaseTime = LEVEL_TO_UNIT_INCREASE_INTERVAL_MS[state.level];
    sendEventToRoom(this.id, {
      type: "update-states",
      data: [state],
    });
    this.sendGoldCountOfAllPlayersToClient();
  }

  public sendGoldCountOfAllPlayersToClient() {
    sendEventToRoom(this.id, {
      type: "update-gold-count",
      data: this.players.map((player) => ({
        playerId: player.userId,
        goldCount: player.goldCount,
      })),
    });
  }
  public incrementGoldCount() {
    this.players.forEach((player) => {
      const myStates = this.states.filter((state) => state.ownerId === player.userId);
      const goldCount = myStates.reduce((acc, state) => acc + state.baseIncome, 0);
      player.goldCount += Math.round(goldCount / 12);
      return { playerId: player.userId, goldCount: player.goldCount };
    });
    this.sendGoldCountOfAllPlayersToClient();
  }
  private sendPickingStateDetailsToClient() {
    sendEventToRoom(this.id, {
      type: "send-picking-state-details",
      data: this.pickingStateDetails,
    });
  }

  public init() {
    const connections = this.players.map((player) =>
      io.connectionsManager.getConnection(player.userId),
    );
    connections.forEach((connection) => {
      //@ts-ignore
      connection?.channel.on("client-to-server", (data: ClientToServerEvent) => {
        if (data.type === "create-unit-movement") {
          this.createBatchMovement(
            data.data.attackerStateId,
            data.data.defenderStateId,
            data.data.unitCount,
          );
        }
        if (data.type === "upgrade-state") {
          this.upgradeState(data.data.stateId);
        }
        if (data.type === "pick-state") {
          const state = this.states.find((state) => state.id === data.data.stateId);
          if (!this.pickingStateDetails.isActive) return;
          if (this.pickingStateDetails.currentPlayerId !== data.data.playerId) return;
          if (this.pickingStateDetails.picksRemaining <= 0) return;
          if (state?.ownerId !== "-1") return;

          const currentPlayerIndex = this.players.findIndex(
            (player) => player.userId === data.data.playerId,
          );
          const currentPlayer = this.players[currentPlayerIndex];
          state.ownerId = currentPlayer.userId;
          if (currentPlayerIndex === this.players.length - 1) {
            this.pickingStateDetails.picksRemaining--;
            this.pickingStateDetails.currentPlayerId = this.players[0].userId;
          } else {
            this.pickingStateDetails.currentPlayerId = this.players[currentPlayerIndex + 1].userId;
          }
          if (this.pickingStateDetails.picksRemaining === 0) {
            this.pickingStateDetails.isActive = false;
          }
          this.sendPickingStateDetailsToClient();

          state.unitCount = 8;
          state.level = 2;
          sendEventToRoom(this.id, {
            type: "update-states",
            data: [state],
          });
        }
      });
    });

    sendEventToRoom(this.id, {
      type: "game-started",
      data: {
        id: this.id,
        players: this.players.map((player) => ({
          id: player.userId,
          name: player.name,
          colors: player.color,
          coin: player.goldCount,
        })),
      },
    });
    setInterval(() => {
      if (this.pickingStateDetails.isActive) return;
      this.incrementGoldCount();
    }, 5000);
    setTimeout(() => {
      this.loadStates();
      this.sendPickingStateDetailsToClient();
    }, 2000);

    setInterval(() => {
      if (this.pickingStateDetails.isActive) return;
      this.updateUnitCountsOnBackend();
    }, 20);
    setInterval(() => {
      if (this.pickingStateDetails.isActive) return;
      this.sendAllStatesUnitCountsToClient();
    }, 2500);
    setInterval(() => {
      if (this.pickingStateDetails.isActive) return;
      this.sendOccupiedStatesUnitCountsToClient();
    }, 500);
  }
}
