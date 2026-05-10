import { FeatureCollection } from "geojson";
import { Application, Assets, Container, Graphics, Text } from "pixi.js";
import { State } from "./classes/state";
import worldData from "../data/all-data.json";
import { detectCollision, getPerpendicularLineAtStart } from "./helpers/geom";
import { colors, PLAYER_COLORS } from "./helpers/constants";
import { Player, ServerToClientEvent, Unit } from "./types/shared";
import { channel, sendEventToServer } from "./helpers/geckos-client";
import { collapseTextChangeRangesAcrossMultipleVersions } from "typescript";

const UNIT_STEP = 0.1;

export class GameState {
  public id: string;
  private states: State[] = [];
  private units: Unit[] = [];
  private players: Player[];

  private myPlayerId: string;
  private selectedStateId: string = "";
  private app: Application;
  private graphics: Graphics;
  private zoom: number = 1;
  private maxZoom: number = 15;
  private minZoom: number = 0.1;
  private isDragging: boolean = false;
  private isArrowDragging: boolean = false;
  private dragStart: { x: number; y: number } = { x: 0, y: 0 };
  private pointerDownPos: { x: number; y: number } = { x: 0, y: 0 };
  private mouseButtonDown: number = -1;
  private dragArrow: Graphics;
  private arrowStartPoint: { x: number; y: number } = { x: 0, y: 0 };
  private arrowDestinationStateId: string | null = null;
  private arrowStartStateId: string | null = null;

  constructor(id: string, players: Player[]) {
    this.app = new Application();
    this.graphics = new Graphics();
    this.dragArrow = new Graphics();
    this.id = id;
    this.players = players;
    console.log("players", players);
    this.myPlayerId = channel.id || "";

    void this.init();
  }

  private static readonly interBoldSrc = new URL("./fonts/Inter_18pt-Bold.ttf", import.meta.url)
    .href;
  private allotStatesToPlayers() {
    const state1 = this.states.find((state) => state.id === "66");
    const state2 = this.states.find((state) => state.id === "67");
    const state3 = this.states.find((state) => state.id === "68");
    const state4 = this.states.find((state) => state.id === "69");
    const state5 = this.states.find((state) => state.id === "70");
    if (!state1 || !state2 || !state3 || !state4 || !state5) return;
    state1.setOwnerId("1", this.players[0].colors.stateBackground);
    state3.setOwnerId("1", this.players[0].colors.stateBackground);
    state4.setOwnerId("1", this.players[0].colors.stateBackground);
    state5.setOwnerId("1", this.players[0].colors.stateBackground);
    state2.setOwnerId("2", this.players[1].colors.stateBackground);
  }
  private getStateById(stateId: string): State | undefined {
    return this.states.find((state) => state.id === stateId);
  }

  private startUnitMovementSimulation(
    attackerStateId: string,
    defenderStateId: string,
    unitCount: number,
  ) {
    const attackerState = this.states.find((state) => state.id === attackerStateId);
    const defenderState = this.states.find((state) => state.id === defenderStateId);
    if (!attackerState || !defenderState) return;
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY = 150;
    const CHUNK_LOCAL_GAP = 0.79;
    const CHUNK_LOCAL_DELAY = 35;
    const startingDate = Date.now();
    for (let i = 0; i < unitCount; i += CHUNK_SIZE) {
      for (let j = 0; j < CHUNK_SIZE; j++) {
        const index = i + j;
        const perpendicularLineStart = getPerpendicularLineAtStart(
          { x: attackerState.labelPoint.x, y: attackerState.labelPoint.y },
          { x: defenderState.labelPoint.x, y: defenderState.labelPoint.y },
          (j - Math.floor(CHUNK_SIZE / 2)) * CHUNK_LOCAL_GAP,
        );

        const perpendicularLineEnd = getPerpendicularLineAtStart(
          { x: defenderState.labelPoint.x, y: defenderState.labelPoint.y },
          { x: attackerState.labelPoint.x, y: attackerState.labelPoint.y },
          -(j - Math.floor(CHUNK_SIZE / 2)) * CHUNK_LOCAL_GAP,
        );
        const indexDifferenceFromMid = Math.abs(j - Math.floor(CHUNK_SIZE / 2));
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
        newUnit.graphics.circle(0, 0, 0.3).fill({ color: "rgba(0,0,0,1)" });
        this.units.push(newUnit);
        this.graphics.addChild(newUnit.graphics);
      }
    }
  }

  private updateUnits() {
    for (const unit of this.units) {
      if (!unit.graphics) continue;
      if (Date.now() < unit.firstRenderAt) continue;

      if (unit.movingDetails) {
        if (Date.now() - unit.lastMovedTimestamp < unit.movingDetails.speed) continue;
        if (
          detectCollision(
            { x: unit.movingDetails.position.x, y: unit.movingDetails.position.y, radius: 0.3 },
            unit.destinationCircle,
          )
        ) {
          unit.graphics.tint = "rgba(0,0,0,0)";
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

        const angle = Math.atan2(
          unit.movingDetails.destination.y - unit.movingDetails.position.y,
          unit.movingDetails.destination.x - unit.movingDetails.position.x,
        );
        unit.movingDetails.position.x += UNIT_STEP * Math.cos(angle);
        unit.movingDetails.position.y += UNIT_STEP * Math.sin(angle);
        unit.graphics.position.set(unit.movingDetails.position.x, unit.movingDetails.position.y);
        unit.lastMovedTimestamp = Date.now();
      }
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
    mapData.features.forEach((feature, index) => {
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
  private getStagePointFromCanvas(mouseX: number, mouseY: number) {
    return {
      x: (mouseX - this.app.stage.position.x) / this.zoom,
      y: (mouseY - this.app.stage.position.y) / this.zoom,
    };
  }
  private getStateAtCanvasPoint(mouseX: number, mouseY: number) {
    const stagePoint = this.getStagePointFromCanvas(mouseX, mouseY);
    return this.states.find((state) => {
      const localPoint = state.graphics.toLocal(stagePoint, this.app.stage);
      return state.graphics.containsPoint(localPoint);
    });
  }
  private drawDragArrowToCanvasPoint(mouseX: number, mouseY: number) {
    const stagePoint = this.getStagePointFromCanvas(mouseX, mouseY);
    const endPoint = this.graphics.toLocal(stagePoint, this.app.stage);
    const startPoint = this.arrowStartPoint;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy);

    this.dragArrow.clear();
    if (length < 0.1) return;

    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const maxZoomToConsider = 7;

    const zoomAwareScale =
      this.zoom < maxZoomToConsider
        ? Math.min(3.4, Math.max(0.8, 1.35 / Math.pow(this.zoom, 1.45)))
        : 0.5;

    const shaftBaseWidth = 3.5 * zoomAwareScale;
    const shaftNeckWidth = 2.2 * zoomAwareScale;
    const headLength = 7.2 * zoomAwareScale;
    const headWidth = 6.2 * zoomAwareScale;
    const chevronDepth = 1.5 * zoomAwareScale;
    const borderWidth = 0.42 * zoomAwareScale;

    if (length <= headLength + 0.5) return;

    const bodyLength = length - headLength;
    const pointAt = (forward: number, lateral: number) => ({
      x: startPoint.x + ux * forward + px * lateral,
      y: startPoint.y + uy * forward + py * lateral,
    });

    const tailLeft = pointAt(0, shaftBaseWidth / 2);
    const tailRight = pointAt(0, -shaftBaseWidth / 2);
    const neckLeft = pointAt(bodyLength, shaftNeckWidth / 2);
    const neckRight = pointAt(bodyLength, -shaftNeckWidth / 2);
    const wingLeft = pointAt(bodyLength + chevronDepth, headWidth / 2);
    const wingRight = pointAt(bodyLength + chevronDepth, -headWidth / 2);
    const tip = pointAt(length, 0);

    const arrowPath = (g: Graphics) =>
      g
        .moveTo(tailLeft.x, tailLeft.y)
        .lineTo(neckLeft.x, neckLeft.y)
        .lineTo(wingLeft.x, wingLeft.y)
        .lineTo(tip.x, tip.y)
        .lineTo(wingRight.x, wingRight.y)
        .lineTo(neckRight.x, neckRight.y)
        .lineTo(tailRight.x, tailRight.y)
        .closePath();

    const shadowOffset = 0.35 * zoomAwareScale;
    this.dragArrow.translateTransform(ux * shadowOffset, uy * shadowOffset);
    arrowPath(this.dragArrow).fill({ color: "#0B1220", alpha: 0.35 });
    this.dragArrow.translateTransform(-ux * shadowOffset, -uy * shadowOffset);

    arrowPath(this.dragArrow)
      .fill({ color: "#F8FAFC", alpha: 0.96 })
      .stroke({ color: "#0B1220", width: borderWidth, alpha: 1, join: "miter", cap: "butt" });

    const highlightInset = 0.35 * zoomAwareScale;
    const hlTail = pointAt(highlightInset * 1.5, shaftBaseWidth / 2 - highlightInset);
    const hlNeck = pointAt(bodyLength - highlightInset * 0.4, shaftNeckWidth / 2 - highlightInset);
    const hlWing = pointAt(
      bodyLength + chevronDepth - highlightInset * 0.6,
      headWidth / 2 - highlightInset * 1.6,
    );
    const hlTip = pointAt(length - highlightInset * 2.2, 0);
    this.dragArrow
      .moveTo(hlTail.x, hlTail.y)
      .lineTo(hlNeck.x, hlNeck.y)
      .lineTo(hlWing.x, hlWing.y)
      .lineTo(hlTip.x, hlTip.y)
      .stroke({ color: "#FFFFFF", width: borderWidth * 0.8, alpha: 0.55, cap: "round" });
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
  private static readonly MARKER_RADIUS = 2;
  private static readonly MARKER_GEOMETRY_RADIUS = 64;
  private static readonly LABEL_FONT_SIZE = 32;
  private static readonly LABEL_TARGET_HEIGHT = 2;

  private drawStateLabel(state: State) {
    if (state.markerElement) {
      state.markerElement.destroy();
    }
    const marker = new Container();
    marker.position.set(state.labelPoint.x, state.labelPoint.y);

    const isDestination = this.arrowDestinationStateId === state.id;
    const circle = new Graphics();
    const owner = this.players.find((player) => player.id === state.ownerId);
    const color = owner ? owner.colors.unitMarker : "#1F2937";

    if (isDestination) {
      const owner = this.players.find((player) => player.id === state.ownerId);
      const color =
        owner?.id === this.myPlayerId
          ? colors.arrowDestinationState.own
          : colors.arrowDestinationState.other;
      circle.circle(0, 0, GameState.MARKER_GEOMETRY_RADIUS * 3).fill({ color: color });
    }
    circle.circle(0, 0, GameState.MARKER_GEOMETRY_RADIUS).fill({ color: color });
    const markerScale = GameState.MARKER_RADIUS / GameState.MARKER_GEOMETRY_RADIUS;
    circle.scale.set(markerScale);
    marker.addChild(circle);

    const label = new Text({
      text: String(state.unitCount),
      anchor: 0.5,
      style: {
        fontSize: GameState.LABEL_FONT_SIZE,
        fontWeight: "700",
        fill: "#ffffff",
        fontFamily: "Inter",
        align: "center",
      },
    });
    state.setUnitLabelElement(label);
    state.setMarkerElement(marker);
    const scale = GameState.LABEL_TARGET_HEIGHT / GameState.LABEL_FONT_SIZE;
    label.scale.set(scale);
    label.position.set(0, 0);
    marker.addChild(label);

    this.graphics.addChild(marker);
  }
  private drawStateLabels() {
    for (const state of this.states) {
      this.drawStateLabel(state);
    }
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

      const worldX = (mouseX - this.app.stage.position.x) / prevZoom;
      const worldY = (mouseY - this.app.stage.position.y) / prevZoom;

      this.app.stage.scale.set(this.zoom);
      this.app.stage.position.set(mouseX - worldX * this.zoom, mouseY - worldY * this.zoom);
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
        this.drawDragArrowToCanvasPoint(mouseX, mouseY);
      }
      if (!this.isDragging) return;
      const deltaX = mouseX - this.dragStart.x;
      const deltaY = mouseY - this.dragStart.y;
      this.app.stage.position.set(
        this.app.stage.position.x + deltaX,
        this.app.stage.position.y + deltaY,
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
        if (clickedState.ownerId !== this.myPlayerId) {
          return;
        }
        this.arrowStartPoint = { x: clickedState.labelPoint.x, y: clickedState.labelPoint.y };
        this.pointerDownPos = { x: mouseX, y: mouseY };
        this.dragStart = { x: mouseX, y: mouseY };
        this.isArrowDragging = true;
        this.arrowStartStateId = clickedState.id;
        this.drawDragArrowToCanvasPoint(mouseX, mouseY);
        // this.app.canvas.setPointerCapture(event.pointerId);
      }
      this.mouseButtonDown = event.button;
    });

    const endDrag = (event: PointerEvent) => {
      //Clichk
      const diffAllowed = 10;
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const mouseNotMovedAfterDown =
        Math.abs(mouseX - this.pointerDownPos.x) < diffAllowed &&
        Math.abs(mouseY - this.pointerDownPos.y) < diffAllowed;
      if (mouseNotMovedAfterDown && this.mouseButtonDown === 0) {
        const stagePoint = {
          x: (mouseX - this.app.stage.position.x) / this.zoom,
          y: (mouseY - this.app.stage.position.y) / this.zoom,
        };
        const newSelectedState = this.states.find((state) => {
          const localPoint = state.graphics.toLocal(stagePoint, this.app.stage);
          return state.graphics.containsPoint(localPoint);
        });
        if (newSelectedState) {
          const previousSelectedState = this.states.find((state) => state.isSelected);
          if (previousSelectedState) {
            previousSelectedState.isSelected = false;
            previousSelectedState.deselect();
          }
          this.selectedStateId = newSelectedState.id;
          newSelectedState.select();
          this.bringStateToFront(newSelectedState);
        }
      }
      if (this.mouseButtonDown === 0 && this.isArrowDragging) {
        const actualEndState = this.getStateAtCanvasPoint(mouseX, mouseY);
        const startState = this.arrowStartStateId
          ? this.getStateById(this.arrowStartStateId)
          : null;

        if (actualEndState && actualEndState.id !== this.arrowStartStateId && startState) {
          sendEventToServer({
            type: "create-unit-movement",
            data: {
              attackerStateId: startState.id,
              defenderStateId: actualEndState.id,
              unitCount: startState.unitCount,
            },
          });
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
    window.addEventListener("blur", stopDragging);
  }
  private async init() {
    await this.loadInterBoldFont();
    this.loadMapData(worldData as FeatureCollection);
    this.allotStatesToPlayers();
    this.drawStates();
    this.drawStateLabels();
    this.graphics.addChild(this.dragArrow);
    //@ts-ignore
    window.states2 = this.states.map((item) => ({ id: item.id, centerPoint: item.labelPoint }));
    await this.renderApp();
    // for (let i = 0; i < 10; i++) {
    //   let randomAttackerStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
    //   let randomDefenderStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
    //   while (randomAttackerStateId === randomDefenderStateId) {
    //     randomDefenderStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
    //   }
    //   this.createUnitMovement(randomAttackerStateId, randomDefenderStateId, 100);
    // }

    //@ts-ignore
    channel.on("server-to-client", (event: ServerToClientEvent) => {
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
          }
        }
        this.drawStateLabels();
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
      }
    });
    //@ts-ignore

    this.update();
  }
  private update() {
    // for (const state of this.states) {
    //   state.increaseUnitCount();
    // }
    this.updateUnits();
    requestAnimationFrame(this.update.bind(this));
  }
}
