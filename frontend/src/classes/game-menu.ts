import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import levelUpgradeIconSrc from "../images/menu/level-upgrade.png";

export class GameMenu {
  private static readonly WIDTH = 96;
  private static readonly BUTTON_SIZE = 50;
  private static readonly BUTTON_TOP = 20;
  private readonly container: Container;
  private readonly panel: Graphics;
  private readonly button: Graphics;
  private readonly upgradeIcon: Sprite;
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

    this.button.on("pointerover", () => {
      this.isButtonHovered = true;
      this.layout(0, this.container.height);
    });
    this.button.on("pointerout", () => {
      this.isButtonHovered = false;
      this.isButtonPressed = false;
      this.layout(0, this.container.height);
    });
    this.button.on("pointerdown", () => {
      this.isButtonPressed = true;
      this.layout(0, this.container.height);
    });
    this.button.on("pointerup", () => {
      this.isButtonPressed = false;
      this.layout(0, this.container.height);
    });
    this.button.on("pointerupoutside", () => {
      this.isButtonPressed = false;
      this.layout(0, this.container.height);
    });
    this.button.on("pointertap", () => {
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
    this.layout(Math.max(0, width), Math.max(0, height));
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
    const buttonAlpha = this.isButtonPressed ? 0.9 : 1;
    const borderAlpha = this.isButtonPressed ? 0.95 : 1;
    const glowAlpha = this.isButtonHovered ? 0.38 : 0.08;
    const buttonColor = this.isButtonHovered ? "#34D399" : "#1F8F43";
    const borderColor = this.isButtonHovered ? "#ECFDF5" : "#A7F3D0";

    this.button.clear();
    this.button.roundRect(buttonX - 3, buttonY - 3, buttonSize + 6, buttonSize + 6, 14).fill({
      color: "#34D399",
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
