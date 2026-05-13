import { Feature, GeoJsonProperties, Geometry } from "geojson";
import { Container, Graphics, Text } from "pixi.js";
import { colors } from "../helpers/constants";
import { GameState } from "../game";
import { Player } from "../types/shared";

export class State {
  private static readonly DEFAULT_FILL_COLOR = "#D7D2CB";
  private static readonly DEFAULT_BORDER_COLOR = "#5C677D";
  private static readonly DEFAULT_BORDER_WIDTH = 0.05;
  private static readonly SELECTED_BORDER_WIDTH = 0.1;
  private static readonly HOVER_TINT_COLOR = "#ffffff";
  private static readonly HOVER_TINT_ALPHA = 0.2;

  private static readonly MARKER_RADIUS = 2;
  private static readonly MARKER_GEOMETRY_RADIUS = 64;
  private static readonly LEVEL_ARC_GEOMETRY_OFFSET = 10;
  private static readonly LEVEL_ARC_GEOMETRY_STROKE = 20;
  private static readonly LABEL_FONT_SIZE = 32;
  private static readonly LABEL_TARGET_HEIGHT = 2;
  id: string;
  name: string;
  graphics: Graphics;
  labelPoint: { x: number; y: number };
  ownerId: string = "-1";
  unitCount: number = 0;
  level: number = 0;
  income: number = 0;
  public unitIncreaseSpeed: number = 1000;
  public lastUnitIncreaseTimestamp: number = 0;
  unitLabelElement: Text;
  markerElement: Container;
  geometry: Geometry;
  isSelected: boolean = false;
  isHovered: boolean = false;
  fillColor: string = State.DEFAULT_FILL_COLOR;
  constructor(id: string, name: string, feature: Feature<Geometry, GeoJsonProperties>) {
    this.id = id;
    this.name = name;
    this.graphics = new Graphics();
    this.labelPoint = { x: 0, y: 0 };
    this.geometry = feature.geometry;
    this.unitLabelElement = new Text();

    this.markerElement = new Container();
    let polygongfx = new Graphics();
    if (!this.geometry) return;
    this.drawGeometryToGraphics(polygongfx, State.DEFAULT_BORDER_COLOR, State.DEFAULT_BORDER_WIDTH);
    this.graphics = polygongfx;
    const labelPoint = this.getLabelPoint(this.geometry as Geometry);
    this.labelPoint = { x: labelPoint.x, y: labelPoint.y };
  }
  private drawPolygonToGraphics(
    coords: number[][][],
    graphics: Graphics,
    strokeColor: string,
    strokeWidth: number,
  ) {
    for (const ring of coords) {
      const points: number[] = [];

      for (const [lon, lat] of ring) {
        const x = (lon + 180) * 4;
        const y = (90 - lat) * 4;

        points.push(x, y);
      }

      graphics
        .poly(points)
        .fill({ color: this.fillColor })
        .stroke({ color: strokeColor, width: strokeWidth });
      if (this.isHovered) {
        graphics
          .poly(points)
          .fill({ color: State.HOVER_TINT_COLOR, alpha: State.HOVER_TINT_ALPHA });
      }
    }
    return graphics;
  }
  private drawGeometryToGraphics(graphics: Graphics, strokeColor: string, strokeWidth: number) {
    graphics.clear();
    if (!this.geometry) return;

    if (this.geometry.type === "Polygon") {
      this.drawPolygonToGraphics(this.geometry.coordinates, graphics, strokeColor, strokeWidth);
    }

    if (this.geometry.type === "MultiPolygon") {
      for (const poly of this.geometry.coordinates) {
        this.drawPolygonToGraphics(poly, graphics, strokeColor, strokeWidth);
      }
    }
  }
  public setUnitLabelElement(label: Text) {
    this.unitLabelElement = label;
  }
  public setMarkerElement(marker: Container) {
    this.markerElement = marker;
  }
  private redraw() {
    const borderColor = this.isSelected ? colors.selectedState : State.DEFAULT_BORDER_COLOR;
    const borderWidth = this.isSelected ? State.SELECTED_BORDER_WIDTH : State.DEFAULT_BORDER_WIDTH;
    this.drawGeometryToGraphics(this.graphics, borderColor, borderWidth);
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
  private getPolygonCentroid(ring: number[][]): {
    x: number;
    y: number;
    area: number;
  } {
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
  public increaseUnitCount() {
    const now = Date.now();
    if (now - this.lastUnitIncreaseTimestamp < this.unitIncreaseSpeed) return;
    this.unitCount++;
    this.lastUnitIncreaseTimestamp = now;
    // this.unitLabelElement.text = String(this.unitCount);
    this.unitLabelElement.text = this.unitCount.toString();
  }

  public drawMarker(isDestination: boolean, players: Player[], myPlayerId: string, zoom: number) {
    if (this.markerElement) {
      this.markerElement.destroy();
    }
    const marker = new Container();
    marker.position.set(this.labelPoint.x, this.labelPoint.y);

    const circle = new Graphics();
    const arc = new Graphics();
    const arcBackground = new Graphics();
    const owner = players.find((player) => player.id === this.ownerId);
    const color = owner ? owner.colors.unitMarker : "#1F2937";
    const level = this.level;

    if (isDestination) {
      const owner = players.find((player) => player.id === this.ownerId);
      const color =
        owner?.id === myPlayerId
          ? colors.arrowDestinationState.own
          : colors.arrowDestinationState.other;
      circle.circle(0, 0, State.MARKER_GEOMETRY_RADIUS * 3).fill({ color: color });
    }
    circle.circle(0, 0, State.MARKER_GEOMETRY_RADIUS).fill({ color: color });
    arcBackground
      .arc(0, 0, State.MARKER_GEOMETRY_RADIUS + State.LEVEL_ARC_GEOMETRY_OFFSET + 2, 0, Math.PI * 2)
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
    const arcRadius = State.MARKER_GEOMETRY_RADIUS + State.LEVEL_ARC_GEOMETRY_OFFSET;
    const arcStartAngle = -Math.PI / 2;
    if (arcAngle > 0) {
      arc.arc(0, 0, arcRadius + 2, arcStartAngle, arcStartAngle + arcAngle).stroke({
        color: "#FFD54A",
        width: State.LEVEL_ARC_GEOMETRY_STROKE - 7,
        alpha: 1,
      });
    }

    const markerScale = State.MARKER_RADIUS / State.MARKER_GEOMETRY_RADIUS;
    marker.addChild(arcBackground);
    circle.scale.set(markerScale);
    arc.scale.set(markerScale);
    arcBackground.scale.set(markerScale);
    marker.addChild(circle);

    const label = new Text({
      text: String(this.unitCount),
      anchor: 0.5,
      style: {
        fontSize: State.LABEL_FONT_SIZE,
        fontWeight: "700",
        fill: "#ffffff",
        fontFamily: "Inter",
        align: "center",
      },
    });
    const scale = State.LABEL_TARGET_HEIGHT / State.LABEL_FONT_SIZE;
    const incomeLabel = new Text({
      text: "+" + String(this.income),
      anchor: 0.5,
      style: {
        fontSize: State.LABEL_FONT_SIZE / 1.25,
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
    incomeBadge.position.set(State.MARKER_RADIUS + 0.55, -State.MARKER_RADIUS - badgeHeight + 0.18);
    marker.addChild(incomeBadge);
    this.setUnitLabelElement(label);
    this.setMarkerElement(marker);
    label.scale.set(scale);
    label.position.set(0, 0);
    marker.scale.set(0.7);
    marker.addChild(label);
    marker.addChild(arc);

    this.graphics.addChild(marker);
  }
  public setUnitCount(unitCount: number) {
    this.unitCount = unitCount;
    this.unitLabelElement.text = String(unitCount);
  }
  public setOwnerId(ownerId: string, ownerColor: string) {
    this.ownerId = ownerId;
    this.fillColor = ownerColor;
    this.redraw();
  }
  public select() {
    this.isSelected = true;
    this.redraw();
  }
  public deselect() {
    this.isSelected = false;
    this.redraw();
    this.graphics.tint = 0xffffff;
  }
  public hover() {
    this.isHovered = true;
    this.redraw();
  }
  public unhover() {
    this.isHovered = false;
    this.redraw();
  }
}
