import { FeatureCollection } from "geojson";
import { Application, Assets, Container, Graphics } from "pixi.js";
import { State } from "./classes/state";
import { GameMenu } from "./classes/game-menu";
import { GameUI } from "./classes/game-ui";
import worldData from "../data/all-data.json";
import {
  detectCollision,
  drawArrowToGraphics,
  getLineAngle,
  getPerpendicularLineAtStart,
} from "./helpers/geom";
import { PickingStateDetails, Player, ServerToClientEvent, Unit } from "./types/shared";
import { channel, sendEventToServer } from "./helpers/geckos-client";

const UNIT_STEP = 0.1;
const UPGRADE_PRICES = [250, 500, 1000, 2000];

const BATCH_MOVEMENT_COST = 25;
const CHUNK_SIZE = 5;
const CHUNK_DELAY = 150;
const CHUNK_LOCAL_GAP = 0.79;
const CHUNK_LOCAL_DELAY = 35;

const POINTER_MOVE_THRESHOLD = 10;
export class GameState {
  public id: string;
  private states: State[] = [];
  private units: Unit[] = [];
  private players: Player[];
  private myPlayerId: string;
  private selectedStateId: string = "";
  private app: Application;
  private graphics: Graphics;
  private uiLayer: Container;
  private gameUI: GameUI;
  private goldCount: number = 1250;
  private zoom: number = 1;
  private maxZoom: number = 15;
  private minZoom: number = 0.1;
  private isDragging: boolean = false;
  private isArrowDragging: boolean = false;
  private dragStart: { x: number; y: number } = { x: 0, y: 0 };
  private pointerDownPos: { x: number; y: number } = { x: 0, y: 0 };
  private mouseButtonDown: number = -1;
  private dragArrow: Graphics;
  private gameMenu: GameMenu;
  private arrowStartPoint: { x: number; y: number } = { x: 0, y: 0 };
  private arrowDestinationStateId: string | null = null;
  private arrowStartStateId: string | null = null;
  private pickingStateDetails?: PickingStateDetails;

  constructor(id: string, players: Player[]) {
    this.id = id;
    this.players = players;
    this.myPlayerId = channel.id || "";
    this.goldCount = this.players.find((player) => player.id === this.myPlayerId)?.coin || 0;
    this.app = new Application();
    this.graphics = new Graphics();
    this.uiLayer = new Container();
    this.gameUI = new GameUI(this.players, this.myPlayerId, this.goldCount);
    this.dragArrow = new Graphics();
    this.gameMenu = new GameMenu();
    this.gameMenu.setOnUpgrade(() => {
      const selectedState = this.getStateById(this.selectedStateId);
      if (!selectedState) return;
      const upgradePrice = UPGRADE_PRICES[selectedState.level];
      if (upgradePrice === undefined) return;
      if (this.goldCount < upgradePrice) return;
      sendEventToServer({
        type: "upgrade-state",
        data: {
          stateId: selectedState.id,
        },
      });
    });
    this.updateUpgradeMenuInfo();

    void this.init();
  }

  private static readonly interBoldSrc = new URL("./fonts/Inter_18pt-Bold.ttf", import.meta.url)
    .href;
  private getStateById(stateId: string): State | undefined {
    return this.states.find((state) => state.id === stateId);
  }
  private updateUpgradeMenuInfo() {
    const selectedState = this.selectedStateId
      ? this.getStateById(this.selectedStateId)
      : undefined;
    if (!selectedState || selectedState.ownerId !== this.myPlayerId) {
      this.gameMenu.setUpgradeInfo("Select", false);
      return;
    }
    const price = UPGRADE_PRICES[selectedState.level];
    if (price === undefined) {
      this.gameMenu.setUpgradeInfo("MAX", false);
      return;
    }
    const canAfford = this.goldCount >= price;
    this.gameMenu.setUpgradeInfo(price.toLocaleString("en-US"), canAfford, !canAfford);
  }

  private startUnitMovementSimulation(
    attackerStateId: string,
    defenderStateId: string,
    unitCount: number,
  ) {
    const attackerState = this.states.find((state) => state.id === attackerStateId);
    const defenderState = this.states.find((state) => state.id === defenderStateId);
    if (!attackerState || !defenderState) return;

    const startingDate = Date.now();
    for (let i = 0; i < unitCount; i += CHUNK_SIZE) {
      const CURRENT_CHUNK_SIZE = Math.min(CHUNK_SIZE, unitCount - i);
      for (let j = 0; j < CURRENT_CHUNK_SIZE; j++) {
        const perpendicularLineStart = getPerpendicularLineAtStart(
          { x: attackerState.labelPoint.x, y: attackerState.labelPoint.y },
          { x: defenderState.labelPoint.x, y: defenderState.labelPoint.y },
          (j - Math.floor(CURRENT_CHUNK_SIZE / 2)) * CHUNK_LOCAL_GAP,
        );

        const perpendicularLineEnd = getPerpendicularLineAtStart(
          { x: defenderState.labelPoint.x, y: defenderState.labelPoint.y },
          { x: attackerState.labelPoint.x, y: attackerState.labelPoint.y },
          -(j - Math.floor(CURRENT_CHUNK_SIZE / 2)) * CHUNK_LOCAL_GAP,
        );
        const indexDifferenceFromMid = Math.abs(j - Math.floor(CURRENT_CHUNK_SIZE / 2));
        const chunkLocalDelay = indexDifferenceFromMid * CHUNK_LOCAL_DELAY;
        const newUnit: Unit = {
          destroyed: false,
          destinationStateId: defenderStateId,
          destinationCircle: {
            x: perpendicularLineEnd.end.x,
            y: perpendicularLineEnd.end.y,
            radius: 1.8,
          },
          firstRenderAt: startingDate + Math.floor(i / CHUNK_SIZE) * CHUNK_DELAY + chunkLocalDelay,
          lastMovedTimestamp:
            startingDate + Math.floor(i / CHUNK_SIZE) * CHUNK_DELAY + chunkLocalDelay,
          playerId: attackerState.ownerId,
          stateId: attackerStateId,
          graphics: new Graphics(),

          movingDetails: {
            position: {
              x: perpendicularLineStart.end.x,
              y: perpendicularLineStart.end.y,
            },
            destination: {
              x: perpendicularLineEnd.end.x,
              y: perpendicularLineEnd.end.y,
            },
            speed: 10,
          },
        };
        const player = this.players.find((player) => player.id === attackerState.ownerId);
        newUnit.graphics.circle(0, 0, 0.35).fill({ color: player?.colors.unit || "#FFFFFF" });
        newUnit.graphics.stroke({ color: "#FFFFFF", width: 0.07 });
        this.units.push(newUnit);
        this.graphics.addChild(newUnit.graphics);
      }
    }
  }

  private updateUnits() {
    for (const unit of this.units) {
      if (!unit.graphics) continue;
      if (Date.now() < unit.firstRenderAt) continue;
      if (!unit.movingDetails) continue;
      if (Date.now() - unit.lastMovedTimestamp < unit.movingDetails.speed) continue;
      const hasCollided = detectCollision(
        { x: unit.movingDetails.position.x, y: unit.movingDetails.position.y, radius: 0.3 },
        unit.destinationCircle,
      );
      if (hasCollided) {
        unit.graphics.destroy();
        const destinationState = unit.destinationStateId
          ? this.getStateById(unit.destinationStateId)
          : null;
        const attackingState = unit.stateId ? this.getStateById(unit.stateId) : null;

        if (destinationState && !unit.destroyed) {
          unit.destroyed = true;
          this.units = this.units.filter((u) => u !== unit);
          // if (destinationState.ownerId === attackingState?.ownerId) {
          //   destinationState.setUnitCount(destinationState.unitCount + 1);
          // } else {
          //   destinationState.setUnitCount(destinationState.unitCount - 1);
          // }
          // const attackingPlayer = unit.playerId
          //   ? this.players.find((player) => player.id === unit.playerId)
          //   : null;
          // if (destinationState.unitCount <= 0 && attackingPlayer) {
          //   destinationState.setOwnerId(
          //     attackingPlayer.id,
          //     attackingPlayer.colors.stateBackground,
          //   );
          // }
        }
        if (destinationState) this.drawStateLabel(destinationState);
        if (attackingState) this.drawStateLabel(attackingState);
        continue;
      }

      const angle = getLineAngle(unit.movingDetails.position, unit.movingDetails.destination);
      unit.movingDetails.position.x += UNIT_STEP * Math.cos(angle);
      unit.movingDetails.position.y += UNIT_STEP * Math.sin(angle);
      unit.graphics.position.set(unit.movingDetails.position.x, unit.movingDetails.position.y);
      unit.lastMovedTimestamp = Date.now();
    }
  }

  private async loadInterBoldFont(): Promise<void> {
    await Assets.load({
      alias: "inter-bold",
      src: GameState.interBoldSrc,
      data: {
        family: "Inter",
        weights: ["700"],
      },
    });
  }
  public loadMapData(mapData: FeatureCollection) {
    mapData.features
      .filter((feature) => feature.properties?.["CONTINENT"] === "Africa")
      .forEach((feature, index) => {
        const newState = new State(index.toString() || "", feature.properties?.name || "", feature);
        this.states.push(newState);
      });
  }
  private bringStateToFront(selectedState: State) {
    const maxStateChildIndex = this.states.reduce((maxIndex, state) => {
      return Math.max(maxIndex, this.graphics.getChildIndex(state.graphics));
    }, -1);
    this.graphics.setChildIndex(selectedState.graphics, maxStateChildIndex);
  }
  private getStateAtCanvasPoint(mouseX: number, mouseY: number) {
    const stagePoint = { x: mouseX, y: mouseY };
    return this.states.find((state) => {
      const localPoint = state.graphics.toLocal(stagePoint, this.app.stage);
      return state.graphics.containsPoint(localPoint);
    });
  }
  private drawDragArrowToCanvasPoint(mouseX: number, mouseY: number) {
    this.dragArrow.clear();
    const endPoint = this.graphics.toLocal({ x: mouseX, y: mouseY }, this.app.stage);
    const startPoint = this.arrowStartPoint;
    drawArrowToGraphics(this.dragArrow, endPoint, startPoint, this.zoom);
  }
  private drawStates() {
    for (const state of this.states) {
      state.graphics.eventMode = "static";
      state.graphics.cursor = "pointer";
      state.graphics.on("pointerover", () => {
        state.hover();
      });
      state.graphics.on("pointerout", () => {
        state.unhover();
      });
      this.graphics.addChild(state.graphics);
    }
    this.app.stage.addChild(this.graphics);
  }

  private drawStateLabel(state: State) {
    const isDestination = this.arrowDestinationStateId === state.id;
    state.drawMarker(isDestination, this.players, this.myPlayerId);
  }
  private drawStateLabels() {
    for (const state of this.states) {
      this.drawStateLabel(state);
    }
  }
  private pickState(stateId: string) {
    sendEventToServer({
      type: "pick-state",
      data: {
        stateId: stateId,
        playerId: this.myPlayerId,
      },
    });
  }
  private async renderApp() {
    const offset = { x: 0, y: 0 };
    offset.x = (window.innerWidth - this.graphics.width) / 2;
    offset.y = (window.innerHeight - this.graphics.height) / 2;
    this.graphics.position.set(offset.x, offset.y);
    this.graphics.position.set(offset.x, offset.y);
    await this.app.init({
      background: "#2B4C7E",
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.app.stage.addChild(this.uiLayer);
    this.uiLayer.addChild(this.gameMenu.getContainer());
    this.uiLayer.addChild(this.gameUI.getContainer());
    this.gameMenu.setPosition(0, 0);
    this.gameMenu.setViewportSize(this.app.screen.width, this.app.screen.height);
    this.gameUI.setViewportSize(this.app.screen.width, this.app.screen.height);
    this.gameMenu.show();

    document.getElementById("pixi-container")!.appendChild(this.app.canvas);

    this.app.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const prevZoom = this.zoom;

      // Scale zoom by delta for consistent behavior across mouse/trackpad.
      this.zoom *= Math.exp(-event.deltaY * 0.0015);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
      if (this.zoom === prevZoom) return;

      const worldX = (mouseX - this.graphics.position.x) / prevZoom;
      const worldY = (mouseY - this.graphics.position.y) / prevZoom;

      this.graphics.scale.set(this.zoom);
      this.graphics.position.set(mouseX - worldX * this.zoom, mouseY - worldY * this.zoom);
    });
    const stopDragging = () => {
      this.isDragging = false;
      this.isArrowDragging = false;
      this.dragStart = { x: 0, y: 0 };
      this.pointerDownPos = { x: 0, y: 0 };
      this.mouseButtonDown = -1;
      this.dragArrow.clear();
    };

    this.app.canvas.style.touchAction = "none";

    this.app.canvas.addEventListener("pointermove", (event) => {
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      if (this.isArrowDragging && this.mouseButtonDown === 0) {
        console.log("Moving arrow");
        const endState = this.getStateAtCanvasPoint(mouseX, mouseY);
        const previousEndState = this.arrowDestinationStateId
          ? this.getStateById(this.arrowDestinationStateId)
          : null;
        if (endState?.id !== this.arrowStartStateId) {
          this.arrowDestinationStateId = endState?.id || null;
        }
        if (endState) {
          this.drawStateLabel(endState);
        }
        if (previousEndState) {
          this.drawStateLabel(previousEndState);
        }
        const hasPointerMoved =
          Math.abs(mouseX - this.pointerDownPos.x) > 2 ||
          Math.abs(mouseY - this.pointerDownPos.y) > 2;
        console.log("hasPointerMoved", hasPointerMoved);
        if (hasPointerMoved) {
          this.drawDragArrowToCanvasPoint(mouseX, mouseY);
        }
      }
      if (!this.isDragging) return;
      const deltaX = mouseX - this.dragStart.x;
      const deltaY = mouseY - this.dragStart.y;
      this.graphics.position.set(
        this.graphics.position.x + deltaX,
        this.graphics.position.y + deltaY,
      );
      this.dragStart = { x: mouseX, y: mouseY };
    });
    this.app.canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 2 || event.button === 1) {
        event.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        this.pointerDownPos = { x: mouseX, y: mouseY };
        this.dragStart = { x: mouseX, y: mouseY };
        this.isDragging = true;
        this.app.canvas.setPointerCapture(event.pointerId);
      }
      if (event.button === 0) {
        event.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const clickedState = this.getStateAtCanvasPoint(mouseX, mouseY);
        if (!clickedState) return;
        if (clickedState.ownerId === this.myPlayerId) {
          this.arrowStartPoint = { x: clickedState.labelPoint.x, y: clickedState.labelPoint.y };
          this.dragStart = { x: mouseX, y: mouseY };
          this.isArrowDragging = true;
          this.arrowStartStateId = clickedState.id;
        }
        this.pointerDownPos = { x: mouseX, y: mouseY };

        // this.drawDragArrowToCanvasPoint(mouseX, mouseY);
        // this.app.canvas.setPointerCapture(event.pointerId);
      }
      this.mouseButtonDown = event.button;
    });

    const endDrag = (event: PointerEvent) => {
      //Clichk
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const mouseNotMovedAfterDown =
        Math.abs(mouseX - this.pointerDownPos.x) < POINTER_MOVE_THRESHOLD &&
        Math.abs(mouseY - this.pointerDownPos.y) < POINTER_MOVE_THRESHOLD;
      const pickingStates = this.pickingStateDetails?.isActive;

      // For picking state
      if (mouseNotMovedAfterDown && this.mouseButtonDown === 0 && pickingStates) {
        const clickedState = this.getStateAtCanvasPoint(mouseX, mouseY);
        this.pickState(clickedState?.id || "");
      }

      // For selecting state
      if (mouseNotMovedAfterDown && this.mouseButtonDown === 0 && !pickingStates) {
        const stagePoint = { x: mouseX, y: mouseY };
        const newSelectedState = this.states.find((state) => {
          const localPoint = state.graphics.toLocal(stagePoint, this.app.stage);
          return state.graphics.containsPoint(localPoint);
        });
        if (newSelectedState) {
          const previousSelectedState = this.states.find((state) => state.isSelected);
          const previousSelectedStateId = previousSelectedState?.id || "";
          if (previousSelectedState) {
            previousSelectedState.deselect();
          }
          if (newSelectedState.id !== previousSelectedStateId) {
            this.selectedStateId = newSelectedState.id;
            newSelectedState.select();
            this.bringStateToFront(newSelectedState);
          }
          this.updateUpgradeMenuInfo();
        } else {
          const previousSelectedState = this.states.find((state) => state.isSelected);
          if (previousSelectedState) {
            previousSelectedState.deselect();
          }
          this.selectedStateId = "";
          this.updateUpgradeMenuInfo();
        }
      }

      //Dragging arrow
      if (this.mouseButtonDown === 0 && this.isArrowDragging && !pickingStates) {
        const actualEndState = this.getStateAtCanvasPoint(mouseX, mouseY);
        const startState = this.arrowStartStateId
          ? this.getStateById(this.arrowStartStateId)
          : null;

        if (actualEndState && actualEndState.id !== this.arrowStartStateId && startState) {
          if (this.goldCount >= BATCH_MOVEMENT_COST) {
            sendEventToServer({
              type: "create-unit-movement",
              data: {
                attackerStateId: startState.id,
                defenderStateId: actualEndState.id,
                unitCount: startState.unitCount,
              },
            });
          }
        }

        const lastStoreEndState = this.arrowDestinationStateId
          ? this.getStateById(this.arrowDestinationStateId)
          : null;

        this.arrowDestinationStateId = null;
        this.arrowStartStateId = null;
        if (lastStoreEndState) {
          this.drawStateLabel(lastStoreEndState);
        }
      }

      this.dragArrow.clear();
      //Drag
      if (this.app.canvas.hasPointerCapture(event.pointerId)) {
        this.app.canvas.releasePointerCapture(event.pointerId);
      }
      stopDragging();
    };

    this.app.canvas.addEventListener("pointerup", endDrag);
    this.app.canvas.addEventListener("pointercancel", endDrag);
    this.app.canvas.addEventListener("lostpointercapture", () => {
      stopDragging();
    });
    window.addEventListener("resize", () => {
      this.gameMenu.setViewportSize(this.app.screen.width, this.app.screen.height);
      this.gameUI.setViewportSize(this.app.screen.width, this.app.screen.height);
    });
    window.addEventListener("blur", stopDragging);
  }
  private async init() {
    await this.loadInterBoldFont();
    this.loadMapData(worldData as FeatureCollection);
    this.drawStates();
    this.drawStateLabels();
    this.graphics.addChild(this.dragArrow);
    await this.renderApp();
    //@ts-ignore
    channel.on("server-to-client", (event: ServerToClientEvent) => {
      console.log("event from backend", event);
      if (event.type === "update-states") {
        const states = event.data;
        console.log("update-states", states);
        for (const state of states) {
          const owner = this.players.find((player) => player.id === state.ownerId);
          const frontendState = this.states.find((s) => s.id === state.id);
          if (frontendState) {
            frontendState.setUnitCount(state.unitCount);
            frontendState.setOwnerId(state.ownerId, owner?.colors.stateBackground || "#D7D2CB");
            frontendState.lastUnitIncreaseTimestamp = state.lastUnitIncreaseTimestamp;
            frontendState.unitIncreaseSpeed = state.unitIncreaseTime;
            frontendState.level = state.level;
            frontendState.income = state.baseIncome;
            console.log("level", state.level);
          }
        }
        this.drawStateLabels();
        this.updateUpgradeMenuInfo();
      }
      if (event.type === "update-batch-movements") {
        const batchMovement = event.data[0];
        this.startUnitMovementSimulation(
          batchMovement.fromStateId,
          batchMovement.toStateId,
          batchMovement.amount,
        );
      }
      if (event.type === "update-unit-counts") {
        const unitCounts = event.data;
        for (const unitCount of unitCounts) {
          const state = this.getStateById(unitCount.stateId);
          if (state) {
            state.setUnitCount(unitCount.unitCount);
          }
        }
      }
      if (event.type === "update-state-owner-changes") {
        const stateOwnerChanges = event.data;
        for (const stateOwnerChange of stateOwnerChanges) {
          const state = this.getStateById(stateOwnerChange.id);
          const ownerPlayer = this.players.find((player) => player.id === stateOwnerChange.ownerId);
          if (state) {
            state.setOwnerId(
              stateOwnerChange.ownerId,
              ownerPlayer?.colors.stateBackground || "#D7D2CB",
            );
            this.drawStateLabel(state);
          }
        }
        this.updateUpgradeMenuInfo();
      }
      if (event.type === "update-gold-count") {
        const goldCounts = event.data;
        for (const goldCount of goldCounts) {
          const player = this.players.find((player) => player.id === goldCount.playerId);
          if (player) {
            player.coin = goldCount.goldCount;
          }
          if (this.myPlayerId === goldCount.playerId) {
            this.goldCount = goldCount.goldCount;
          }
        }
        this.gameUI.setGoldCount(this.goldCount);
        this.updateUpgradeMenuInfo();
      }
      if (event.type === "send-picking-state-details") {
        this.pickingStateDetails = event.data;
        this.gameUI.setPickingStateDetails(this.pickingStateDetails);
      }
    });
    //@ts-ignore

    this.update();
    setInterval(() => {
      this.update.bind(this)();
    }, 16.67);
  }

  private update() {
    this.updateUnits();
  }
}
