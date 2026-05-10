import { Feature, GeoJsonProperties, Geometry } from "geojson";
import { Container, Graphics, Text } from "pixi.js";
import { colors } from "../helpers/constants";

export class State {
  private static readonly DEFAULT_FILL_COLOR = "#D7D2CB";
  private static readonly DEFAULT_BORDER_COLOR = "#5C677D";
  private static readonly DEFAULT_BORDER_WIDTH = 0.2;
  private static readonly SELECTED_BORDER_WIDTH = 0.4;
  private static readonly HOVER_TINT_COLOR = "#ffffff";
  private static readonly HOVER_TINT_ALPHA = 0.2;
  id: string;
  name: string;
  graphics: Graphics;
  labelPoint: { x: number; y: number };
  ownerId: string = "-1";
  unitCount: number = 0;
  level: number = 0;
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
