import { FeatureCollection } from "geojson";
import { Application, Assets, Container, Graphics, Text } from "pixi.js";
import { State } from "./classes/state";
import worldData from "../data/all-data.json";
import { detectCollision, getPerpendicularLineAtStart } from "./helpers/geom";

interface Player {
  name: string;
  id: string;
  color: string;
}

interface MovingUnitDetails {
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

interface Unit {
  playerId: string;
  movingDetails?: MovingUnitDetails;
  stateId?: string;
  graphics: Graphics;
  lastMovedTimestamp: number;
  firstRenderAt: number;

  destinationCircle: { x: number; y: number; radius: number };
}
const UNIT_STEP = 0.1;

export class GameState {
  private states: State[] = [];
  private units: Unit[] = [];
  private players: Player[] = [
    { name: "Player 1", id: "1", color: "rgb(255, 0, 0)" },
    { name: "Player 2", id: "2", color: "rgb(0, 0, 255)" },
  ];
  private selectedStateId: string = "";
  private app: Application;
  private graphics: Graphics;
  private zoom: number = 1;
  private maxZoom: number = 12;
  private minZoom: number = 0.1;
  private isDragging: boolean = false;
  private dragStart: { x: number; y: number } = { x: 0, y: 0 };
  private pointerDownPos: { x: number; y: number } = { x: 0, y: 0 };
  private mouseButtonDown: number = 0;

  constructor() {
    this.app = new Application();
    this.graphics = new Graphics();

    void this.init();
  }

  private static readonly interBoldSrc = new URL("./fonts/Inter_18pt-Bold.ttf", import.meta.url).href;

  private createUnitMovement(attackerStateId: string, defenderStateId: string, unitCount: number) {
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
          destinationCircle: {
            x: perpendicularLineEnd.end.x,
            y: perpendicularLineEnd.end.y,
            radius: 1.8,
          },
          firstRenderAt: startingDate + Math.floor(i / CHUNK_SIZE) * CHUNK_DELAY + chunkLocalDelay,
          lastMovedTimestamp: startingDate + Math.floor(i / CHUNK_SIZE) * CHUNK_DELAY + chunkLocalDelay,
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
            speed: 1,
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
        if (detectCollision({ x: unit.movingDetails.position.x, y: unit.movingDetails.position.y, radius: 0.3 }, unit.destinationCircle)) {
          unit.graphics.tint = "rgba(0,0,0,0)";
          unit.graphics.destroy();
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

  private drawStateLabels() {
    for (const state of this.states) {
      const marker = new Container();
      marker.position.set(state.labelPoint.x, state.labelPoint.y);

      const circle = new Graphics();
      circle.circle(0, 0, GameState.MARKER_GEOMETRY_RADIUS).fill({ color: "#1F2937" });
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
      const scale = GameState.LABEL_TARGET_HEIGHT / GameState.LABEL_FONT_SIZE;
      label.scale.set(scale);
      label.position.set(0, 0);
      marker.addChild(label);

      this.graphics.addChild(marker);
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
      this.dragStart = { x: 0, y: 0 };
      this.pointerDownPos = { x: 0, y: 0 };
    };

    this.app.canvas.style.touchAction = "none";

    this.app.canvas.addEventListener("pointermove", (event) => {
      if (!this.isDragging) return;

      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const deltaX = mouseX - this.dragStart.x;
      const deltaY = mouseY - this.dragStart.y;
      this.app.stage.position.set(this.app.stage.position.x + deltaX, this.app.stage.position.y + deltaY);
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
        this.pointerDownPos = { x: mouseX, y: mouseY };
        this.dragStart = { x: mouseX, y: mouseY };
      }
      this.mouseButtonDown = event.button;
    });

    const endDrag = (event: PointerEvent) => {
      //Clichk
      const diffAllowed = 10;
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const mouseNotMovedAfterDown = Math.abs(mouseX - this.pointerDownPos.x) < diffAllowed && Math.abs(mouseY - this.pointerDownPos.y) < diffAllowed;
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
    this.drawStates();
    this.drawStateLabels();
    await this.renderApp();
    for (let i = 0; i < 10; i++) {
      let randomAttackerStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
      let randomDefenderStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
      while (randomAttackerStateId === randomDefenderStateId) {
        randomDefenderStateId = this.states[Math.floor(Math.random() * this.states.length)].id;
      }
      this.createUnitMovement(randomAttackerStateId, randomDefenderStateId, 100);
    }

    this.update();
  }
  private update() {
    for (const state of this.states) {
      state.increaseUnitCount();
    }
    this.updateUnits();
    requestAnimationFrame(this.update.bind(this));
  }
}
