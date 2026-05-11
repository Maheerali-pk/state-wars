import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import levelUpgradeIconSrc from "../images/menu/level-upgrade.png";

export class GameMenu {
  private static readonly WIDTH = 96;
  private static readonly BUTTON_SIZE = 50;
  private static readonly BUTTON_TOP = 20;
  private readonly container: Container;
  private readonly panel: Graphics;
  private readonly button: Graphics;
  private readonly upgradeIcon: Sprite;
  private readonly upgradePriceLabel: Text;
  private upgradePriceText = "Select";
  private isUpgradeAvailable = false;
  private isInsufficientFunds = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private isButtonHovered = false;
  private isButtonPressed = false;

  private onUpgrade: (() => void) | null = null;

  constructor() {
    this.container = new Container();
    this.container.visible = true;
    this.container.eventMode = "static";

    this.panel = new Graphics();
    this.container.addChild(this.panel);

    this.button = new Graphics();
    this.button.eventMode = "static";
    this.button.cursor = "pointer";
    this.container.addChild(this.button);

    this.upgradeIcon = new Sprite(Texture.WHITE);
    this.upgradeIcon.anchor.set(0.5);
    this.upgradeIcon.position.set(GameMenu.WIDTH / 2, 152);
    this.upgradeIcon.width = 40;
    this.upgradeIcon.height = 40;
    this.upgradeIcon.roundPixels = true;
    this.upgradeIcon.tint = "#A7F3D0";
    this.button.addChild(this.upgradeIcon);

    this.upgradePriceLabel = new Text({
      text: this.upgradePriceText,
      anchor: 0.5,
      style: {
        fontSize: 12,
        fontWeight: "700",
        fill: "#94A3B8",
        fontFamily: "Inter",
        align: "center",
      },
    });
    this.container.addChild(this.upgradePriceLabel);

    this.button.on("pointerover", () => {
      if (!this.isUpgradeAvailable) return;
      this.isButtonHovered = true;
      this.layout(this.viewportWidth, this.viewportHeight);
    });
    this.button.on("pointerout", () => {
      this.isButtonHovered = false;
      this.isButtonPressed = false;
      this.layout(this.viewportWidth, this.viewportHeight);
    });
    this.button.on("pointerdown", () => {
      if (!this.isUpgradeAvailable) return;
      this.isButtonPressed = true;
      this.layout(this.viewportWidth, this.viewportHeight);
    });
    this.button.on("pointerup", () => {
      this.isButtonPressed = false;
      this.layout(this.viewportWidth, this.viewportHeight);
    });
    this.button.on("pointerupoutside", () => {
      this.isButtonPressed = false;
      this.layout(this.viewportWidth, this.viewportHeight);
    });
    this.button.on("pointertap", () => {
      if (!this.isUpgradeAvailable) return;
      this.onUpgrade?.();
    });
    this.layout(0, 0);
    void this.loadIcons();
  }

  public getContainer() {
    return this.container;
  }

  public setOnUpgrade(callback: () => void) {
    this.onUpgrade = callback;
  }

  public setPosition(x: number, y: number) {
    this.container.position.set(x, y);
  }

  public setViewportSize(width: number, height: number) {
    this.viewportWidth = Math.max(0, width);
    this.viewportHeight = Math.max(0, height);
    this.layout(this.viewportWidth, this.viewportHeight);
  }

  public setUpgradeInfo(priceText: string, canUpgrade: boolean, isInsufficientFunds = false) {
    this.upgradePriceText = priceText;
    this.isUpgradeAvailable = canUpgrade;
    this.isInsufficientFunds = isInsufficientFunds;
    this.layout(this.viewportWidth, this.viewportHeight);
  }

  public show() {
    this.container.visible = true;
  }

  public hide() {
    this.container.visible = false;
  }

  private layout(_viewportWidth: number, viewportHeight: number) {
    const menuHeight = viewportHeight;
    this.panel.clear();
    this.panel.rect(0, 0, GameMenu.WIDTH, menuHeight).fill({ color: "#08111F", alpha: 0.94 });
    this.panel.rect(0, 0, GameMenu.WIDTH, menuHeight).stroke({
      color: "#203049",
      width: 1.5,
      alpha: 1,
    });

    const buttonSize = GameMenu.BUTTON_SIZE;
    const buttonX = (GameMenu.WIDTH - buttonSize) / 2;
    const buttonY = GameMenu.BUTTON_TOP;
    const isEnabled = this.isUpgradeAvailable;
    const isInsufficient = this.isInsufficientFunds;
    const buttonAlpha = isEnabled ? (this.isButtonPressed ? 0.9 : 1) : isInsufficient ? 0.48 : 0.42;
    const borderAlpha = isEnabled ? (this.isButtonPressed ? 0.95 : 1) : isInsufficient ? 0.75 : 0.65;
    const glowAlpha = isEnabled ? (this.isButtonHovered ? 0.38 : 0.08) : 0.01;
    const buttonColor = isEnabled
      ? this.isButtonHovered
        ? "#34D399"
        : "#1F8F43"
      : isInsufficient
        ? "#1E293B"
        : "#0F172A";
    const borderColor = isEnabled
      ? this.isButtonHovered
        ? "#ECFDF5"
        : "#A7F3D0"
      : isInsufficient
        ? "#64748B"
        : "#475569";
    const glowColor = "#475569";

    this.button.cursor = isEnabled ? "pointer" : "not-allowed";
    this.button.clear();
    this.button.roundRect(buttonX - 3, buttonY - 3, buttonSize + 6, buttonSize + 6, 14).fill({
      color: glowColor,
      alpha: glowAlpha,
    });
    this.button.roundRect(buttonX, buttonY, buttonSize, buttonSize, 12).fill({
      color: buttonColor,
      alpha: buttonAlpha,
    });
    this.button.roundRect(buttonX, buttonY, buttonSize, buttonSize, 12).stroke({
      color: borderColor,
      width: 2,
      alpha: borderAlpha,
    });

    const iconPressOffset = this.isButtonPressed ? 1 : 0;
    this.upgradeIcon.position.set(
      buttonX + buttonSize / 2,
      buttonY + buttonSize / 2 + iconPressOffset,
    );
    this.upgradeIcon.alpha = isEnabled ? 1 : isInsufficient ? 0.5 : 0.42;
    this.upgradeIcon.tint = isEnabled ? 0xffffff : "#94A3B8";
    this.upgradePriceLabel.text = this.upgradePriceText;
    this.upgradePriceLabel.style.fill = isEnabled ? "#F8FAFC" : "#64748B";
    this.upgradePriceLabel.position.set(GameMenu.WIDTH / 2, buttonY + buttonSize + 14);
  }

  private async loadIcons() {
    try {
      const upgradeTexture = await Assets.load(levelUpgradeIconSrc);
      this.upgradeIcon.texture = upgradeTexture as Texture;
      this.upgradeIcon.tint = 0xffffff;
      this.upgradeIcon.roundPixels = true;
    } catch (error) {
      console.error("Failed to load menu icons", error);
    }
  }
}
