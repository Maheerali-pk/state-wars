import { Application, Graphics } from "pixi.js";
import worldData from "../data/all-data.json";
import { FeatureCollection } from "geojson";
import { State } from "./classes/state";
import { GameState } from "./game";
const mapData = worldData as FeatureCollection;

let zoom = 1;
let offset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let isDragging = false;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 10;

const allPolygons: Graphics[] = [];
const graphics = new Graphics();
(async () => {
  // Create a new application
  const game = new GameState();
  const app = new Application();

  // Load the bunny texture
})();

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
