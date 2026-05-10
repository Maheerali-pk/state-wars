import { PlayerColors } from "../types/shared";

export const colors = {
  selectedState: "#FFD54A",
  arrowDestinationState: { own: "rgba(0,255,0,0.4)", other: "rgba(255,0,0,0.4)" },
};

export const PLAYER_COLORS: PlayerColors[] = [
  // Blue
  {
    stateBackground: "#6EA8FE",
    unitMarker: "#2F5FB3",
    unit: "#FFFFFF",
    basic: "#4D8DFF",
  },

  // Red
  {
    stateBackground: "#F28B82",
    unitMarker: "#B9382F",
    unit: "#FFFFFF",
    basic: "#E85B52",
  },

  // Green
  {
    stateBackground: "#81C995",
    unitMarker: "#2E7D4F",
    unit: "#FFFFFF",
    basic: "#4CAF6A",
  },

  // Purple
  {
    stateBackground: "#B39DDB",
    unitMarker: "#6B46C1",
    unit: "#FFFFFF",
    basic: "#8B5CF6",
  },

  // Orange
  {
    stateBackground: "#F6AD55",
    unitMarker: "#C05621",
    unit: "#FFFFFF",
    basic: "#ED8936",
  },

  // Cyan
  {
    stateBackground: "#76E4F7",
    unitMarker: "#0E7490",
    unit: "#FFFFFF",
    basic: "#06B6D4",
  },

  // Pink
  {
    stateBackground: "#F9A8D4",
    unitMarker: "#BE185D",
    unit: "#FFFFFF",
    basic: "#EC4899",
  },

  // Yellow
  {
    stateBackground: "#FDE68A",
    unitMarker: "#B7791F",
    unit: "#1F2937",
    basic: "#FACC15",
  },
];
