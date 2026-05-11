import { FeatureCollection } from "geojson";
import { Application, Assets, Batch, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { State } from "./classes/state";
import { GameMenu } from "./classes/game-menu";
import worldData from "../data/all-data.json";
import goldCoinIconSrc from "./images/menu/gold-coin.png";
import { detectCollision, getPerpendicularLineAtStart } from "./helpers/geom";
import { colors } from "./helpers/constants";
import { PickingStateDetails, Player, ServerToClientEvent, Unit } from "./types/shared";
import { channel, sendEventToServer } from "./helpers/geckos-client";
import { collapseTextChangeRangesAcrossMultipleVersions } from "typescript";

const UNIT_STEP = 0.1;
const UPGRADE_PRICES = [250, 500, 1000, 2000];

const BATCH_MOVEMENT_COST = 25;
export class GameState {
  public id: string;
  private states: State[] = [];
  private units: Unit[] = [];
  private unitDestroyEffects: {
    graphics: Graphics;
    startedAt: number;
    durationMs: number;
  }[] = [];
  private players: Player[];

  private myPlayerId: string;
  private selectedStateId: string = "";
  private app: Application;
  private graphics: Graphics;
  private uiLayer: Container;
  private currencyHud: Container;
  private currencyBg: Graphics;
  private currencyIcon: Sprite;
  private currencyText: Text;
  private pickingTurnHud: Container;
  private pickingTurnBg: Graphics;
  private pickingTurnText: Text;
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
    this.app = new Application();
    this.graphics = new Graphics();
    this.uiLayer = new Container();
    this.currencyHud = new Container();
    this.currencyBg = new Graphics();
    this.currencyIcon = new Sprite(Texture.WHITE);
    this.currencyText = new Text({
      text: this.goldCount.toLocaleString("en-US"),
      anchor: { x: 1, y: 0.5 },
      style: {
        fontSize: 30,
        fontWeight: "800",
        fill: "#FFFFFF",
        fontFamily: "Inter",
        letterSpacing: 0.8,
      },
    });
    this.pickingTurnHud = new Container();
    this.pickingTurnBg = new Graphics();
    this.pickingTurnText = new Text({
      text: "",
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 20,
        fontWeight: "700",
        fill: "#FFFFFF",
        fontFamily: "Inter",
        align: "center",
      },
    });
    this.dragArrow = new Graphics();
    this.gameMenu = new GameMenu();
    this.id = id;
    this.players = players;
    console.log("players", players);
    this.myPlayerId = channel.id || "";
    this.goldCount = this.players.find((player) => player.id === this.myPlayerId)?.coin || 0;
    this.gameMenu.setOnUpgrade(() => {
      if (!this.selectedStateId) return;
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
    this.setupCurrencyHud();
    this.setupPickingTurnHud();
    this.updateUpgradeMenuInfo();

    void this.init();
  }

  private static readonly interBoldSrc = new URL("./fonts/Inter_18pt-Bold.ttf", import.meta.url)
    .href;
  private allotStatesToPlayers() {}
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
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY = 150;
    const CHUNK_LOCAL_GAP = 0.79;
    const CHUNK_LOCAL_DELAY = 35;
    const startingDate = Date.now();
    for (let i = 0; i < unitCount; i += CHUNK_SIZE) {
      const CURRENT_CHUNK_SIZE = Math.min(CHUNK_SIZE, unitCount - i);
      for (let j = 0; j < CURRENT_CHUNK_SIZE; j++) {
        const index = i + j;
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

      if (unit.movingDetails) {
        if (Date.now() - unit.lastMovedTimestamp < unit.movingDetails.speed) continue;
        if (
          detectCollision(
            { x: unit.movingDetails.position.x, y: unit.movingDetails.position.y, radius: 0.3 },
            unit.destinationCircle,
          )
        ) {
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
  private spawnUnitDestroyEffect(x: number, y: number, color: string) {
    const impactGraphic = new Graphics();
    impactGraphic.position.set(x, y);
    impactGraphic.circle(0, 0, 0.45).fill({ color, alpha: 0.4 });
    impactGraphic.circle(0, 0, 0.7).stroke({ color: "#FFFFFF", width: 0.08, alpha: 0.95 });
    this.graphics.addChild(impactGraphic);
    this.unitDestroyEffects.push({
      graphics: impactGraphic,
      startedAt: Date.now(),
      durationMs: 220,
    });
  }
  private updateUnitDestroyEffects() {
    const now = Date.now();
    for (let i = this.unitDestroyEffects.length - 1; i >= 0; i--) {
      const effect = this.unitDestroyEffects[i];
      const elapsed = now - effect.startedAt;
      const progress = elapsed / effect.durationMs;
      if (progress >= 1) {
        effect.graphics.destroy();
        this.unitDestroyEffects.splice(i, 1);
        continue;
      }

      const easedProgress = 1 - (1 - progress) * (1 - progress);
      effect.graphics.scale.set(1 + easedProgress * 2.1);
      effect.graphics.alpha = 1 - progress;
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
    const endPoint = this.graphics.toLocal({ x: mouseX, y: mouseY }, this.app.stage);
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
  private static readonly LEVEL_ARC_GEOMETRY_OFFSET = 10;
  private static readonly LEVEL_ARC_GEOMETRY_STROKE = 20;
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
    const arc = new Graphics();
    const arcBackground = new Graphics();
    const owner = this.players.find((player) => player.id === state.ownerId);
    const color = owner ? owner.colors.unitMarker : "#1F2937";
    const level = state.level;

    if (isDestination) {
      const owner = this.players.find((player) => player.id === state.ownerId);
      const color =
        owner?.id === this.myPlayerId
          ? colors.arrowDestinationState.own
          : colors.arrowDestinationState.other;
      circle.circle(0, 0, GameState.MARKER_GEOMETRY_RADIUS * 3).fill({ color: color });
    }
    circle.circle(0, 0, GameState.MARKER_GEOMETRY_RADIUS).fill({ color: color });
    arcBackground
      .arc(
        0,
        0,
        GameState.MARKER_GEOMETRY_RADIUS + GameState.LEVEL_ARC_GEOMETRY_OFFSET + 2,
        0,
        Math.PI * 2,
      )
      .stroke({ color: "#0B1220", alpha: 0.5, width: 20 });
    let arcAngle = 0;
    if (level === 0) {
      arcAngle = 0;
    }
    if (level === 1) {
      arcAngle = Math.PI / 2;
    }
    if (level === 2) {
      arcAngle = Math.PI;
    }
    if (level === 3) {
      arcAngle = Math.PI * 2;
    }
    const arcRadius = GameState.MARKER_GEOMETRY_RADIUS + GameState.LEVEL_ARC_GEOMETRY_OFFSET;
    const arcStartAngle = -Math.PI / 2;
    if (arcAngle > 0) {
      arc.arc(0, 0, arcRadius + 2, arcStartAngle, arcStartAngle + arcAngle).stroke({
        color: "#FFD54A",
        width: GameState.LEVEL_ARC_GEOMETRY_STROKE - 7,
        alpha: 1,
      });
    }

    const markerScale = GameState.MARKER_RADIUS / GameState.MARKER_GEOMETRY_RADIUS;
    marker.addChild(arcBackground);
    circle.scale.set(markerScale);
    arc.scale.set(markerScale);
    arcBackground.scale.set(markerScale);
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
    const scale = GameState.LABEL_TARGET_HEIGHT / GameState.LABEL_FONT_SIZE;
    const incomeLabel = new Text({
      text: "+" + String(state.income),
      anchor: 0.5,
      style: {
        fontSize: GameState.LABEL_FONT_SIZE / 1.25,
        fontWeight: "600",
        fill: "#DCFCE7",
      },
    });
    incomeLabel.scale.set(scale * 0.92);

    const incomeBadge = new Container();
    const incomeBadgeBg = new Graphics();
    const badgePaddingX = 0.55;
    const badgePaddingY = 0.3;
    const badgeWidth = incomeLabel.width + badgePaddingX * 2;
    const badgeHeight = incomeLabel.height + badgePaddingY * 2;

    incomeBadgeBg.roundRect(0, 0, badgeWidth, badgeHeight, badgeHeight / 2).fill({
      color: "#14532D",
      alpha: 0.95,
    });
    incomeBadgeBg.roundRect(0, 0, badgeWidth, badgeHeight, badgeHeight / 2).stroke({
      color: "#86EFAC",
      width: 0.1,
      alpha: 0.9,
    });
    incomeLabel.position.set(badgeWidth / 2, badgeHeight / 2);
    incomeBadge.addChild(incomeBadgeBg);
    incomeBadge.addChild(incomeLabel);
    incomeBadge.position.set(
      GameState.MARKER_RADIUS + 0.55,
      -GameState.MARKER_RADIUS - badgeHeight + 0.18,
    );
    marker.addChild(incomeBadge);

    state.setUnitLabelElement(label);
    state.setMarkerElement(marker);
    label.scale.set(scale);
    label.position.set(0, 0);
    marker.addChild(label);
    marker.addChild(arc);

    this.graphics.addChild(marker);
  }
  private drawStateLabels() {
    for (const state of this.states) {
      this.drawStateLabel(state);
    }
  }
  private setupCurrencyHud() {
    this.currencyHud.eventMode = "none";
    this.currencyHud.addChild(this.currencyBg);

    this.currencyIcon.anchor.set(0.5);
    this.currencyIcon.width = 25;
    this.currencyIcon.height = 25;
    this.currencyIcon.tint = "#F59E0B";
    this.currencyHud.addChild(this.currencyIcon);

    this.currencyText.resolution = 2;
    this.currencyHud.addChild(this.currencyText);
    void this.loadCurrencyIcon();
  }
  private setupPickingTurnHud() {
    this.pickingTurnHud.eventMode = "none";
    this.pickingTurnHud.visible = false;
    this.pickingTurnHud.addChild(this.pickingTurnBg);
    this.pickingTurnHud.addChild(this.pickingTurnText);
  }
  private async loadCurrencyIcon() {
    try {
      const coinTexture = await Assets.load(goldCoinIconSrc);
      this.currencyIcon.texture = coinTexture as Texture;
      this.currencyIcon.tint = 0xffffff;
    } catch (error) {
      console.error("Failed to load currency icon", error);
    }
  }
  private updateCurrencyHudLayout() {
    const rightPadding = 0;
    const topPadding = 0;
    const hudHeight = 58;
    const hudWidth = 160;
    const leftPadding = 14;
    const iconGap = 10;

    this.currencyHud.position.set(this.app.screen.width - hudWidth - rightPadding, topPadding);
    this.currencyBg.clear();
    this.currencyBg.roundRect(0, 0, hudWidth, hudHeight, 0).fill({ color: "#0F172A", alpha: 0.92 });
    this.currencyBg.roundRect(0, 0, hudWidth, hudHeight, 0).stroke({
      color: "#334155",
      width: 2,
      alpha: 1,
    });

    this.currencyText.text = this.goldCount.toLocaleString("en-US");
    this.currencyText.anchor.set(0, 0.5);
    this.currencyIcon.position.set(leftPadding + this.currencyIcon.width / 2, hudHeight / 2);
    this.currencyText.position.set(
      this.currencyIcon.position.x + this.currencyIcon.width / 2 + iconGap,
      hudHeight / 2,
    );
  }
  private updatePickingTurnHudLayout() {
    const details = this.pickingStateDetails;
    if (!details?.isActive) {
      this.pickingTurnHud.visible = false;
      return;
    }

    const isMyTurn = details.currentPlayerId === this.myPlayerId;
    const activePlayer = this.players.find((player) => player.id === details.currentPlayerId);
    this.pickingTurnText.text = isMyTurn
      ? `It is your turn to pick the state. Remaining picks: ${details.picksRemaining}`
      : `${activePlayer?.name || "Other player"}'s turn to pick state... Remaining picks: ${details.picksRemaining}`;

    const horizontalPadding = 16;
    const verticalPadding = 10;
    const hudWidth = this.pickingTurnText.width + horizontalPadding * 2;
    const hudHeight = this.pickingTurnText.height + verticalPadding * 2;
    const topPadding = 10;

    this.pickingTurnHud.visible = true;
    this.pickingTurnHud.position.set((this.app.screen.width - hudWidth) / 2, topPadding);

    this.pickingTurnBg.clear();
    this.pickingTurnBg.roundRect(0, 0, hudWidth, hudHeight, 10).fill({
      color: "#0B1220",
      alpha: 0.9,
    });
    this.pickingTurnBg.roundRect(0, 0, hudWidth, hudHeight, 10).stroke({
      color: isMyTurn ? "#22C55E" : "#64748B",
      width: 2,
      alpha: 1,
    });

    this.pickingTurnText.position.set(hudWidth / 2, hudHeight / 2);
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
    this.uiLayer.addChild(this.currencyHud);
    this.uiLayer.addChild(this.pickingTurnHud);
    this.gameMenu.setPosition(0, 0);
    this.gameMenu.setViewportSize(this.app.screen.width, this.app.screen.height);
    this.gameMenu.show();
    this.updateCurrencyHudLayout();
    this.updatePickingTurnHudLayout();

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
      const diffAllowed = 10;
      const rect = this.app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const mouseNotMovedAfterDown =
        Math.abs(mouseX - this.pointerDownPos.x) < diffAllowed &&
        Math.abs(mouseY - this.pointerDownPos.y) < diffAllowed;
      console.log(
        "mouseNotMovedAfterDown",
        mouseNotMovedAfterDown,
        this.mouseButtonDown,
        this.pickingStateDetails?.isActive,
      );
      const pickingStates = this.pickingStateDetails?.isActive;
      if (mouseNotMovedAfterDown && this.mouseButtonDown === 0 && pickingStates) {
        const clickedState = this.getStateAtCanvasPoint(mouseX, mouseY);
        this.pickState(clickedState?.id || "");
      }
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
            previousSelectedState.isSelected = false;
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
            previousSelectedState.isSelected = false;
            previousSelectedState.deselect();
          }
          this.selectedStateId = "";
          this.updateUpgradeMenuInfo();
        }
      }
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
    // this.app.canvas.addEventListener("pointercancel", endDrag);
    // this.app.canvas.addEventListener("lostpointercapture", () => {
    //   stopDragging();
    // });
    window.addEventListener("resize", () => {
      this.gameMenu.setViewportSize(this.app.screen.width, this.app.screen.height);
      this.updateCurrencyHudLayout();
      this.updatePickingTurnHudLayout();
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
        this.updateCurrencyHudLayout();
        this.updateUpgradeMenuInfo();
      }
      if (event.type === "send-picking-state-details") {
        this.pickingStateDetails = event.data;
        this.updatePickingTurnHudLayout();
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
    this.updateUnitDestroyEffects();
    requestAnimationFrame(this.update.bind(this));
  }
}
