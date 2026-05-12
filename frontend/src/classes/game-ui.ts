import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import goldCoinIconSrc from "../images/menu/gold-coin.png";
import { PickingStateDetails, Player } from "../types/shared";

export class GameUI {
  private readonly container: Container;
  private readonly currencyHud: Container;
  private readonly currencyBg: Graphics;
  private readonly currencyIcon: Sprite;
  private readonly currencyText: Text;
  private readonly pickingTurnHud: Container;
  private readonly pickingTurnBg: Graphics;
  private readonly pickingTurnText: Text;
  private readonly players: Player[];
  private readonly myPlayerId: string;
  private goldCount: number;
  private pickingStateDetails?: PickingStateDetails;
  private viewportWidth = 0;

  constructor(players: Player[], myPlayerId: string, initialGoldCount: number) {
    this.players = players;
    this.myPlayerId = myPlayerId;
    this.goldCount = initialGoldCount;
    this.container = new Container();
    this.container.eventMode = "none";
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
    this.setupCurrencyHud();
    this.setupPickingTurnHud();
    this.container.addChild(this.currencyHud);
    this.container.addChild(this.pickingTurnHud);
    this.layout();
    void this.loadCurrencyIcon();
  }

  public getContainer() {
    return this.container;
  }

  public setViewportSize(width: number, _height: number) {
    this.viewportWidth = Math.max(0, width);
    this.layout();
  }

  public setGoldCount(goldCount: number) {
    this.goldCount = goldCount;
    this.updateCurrencyHudLayout();
  }

  public setPickingStateDetails(details?: PickingStateDetails) {
    this.pickingStateDetails = details;
    this.updatePickingTurnHudLayout();
  }

  private layout() {
    this.updateCurrencyHudLayout();
    this.updatePickingTurnHudLayout();
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

    this.currencyHud.position.set(this.viewportWidth - hudWidth - rightPadding, topPadding);
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
    this.pickingTurnHud.position.set((this.viewportWidth - hudWidth) / 2, topPadding);

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
}
