/**
 * Constants for Venice agents application
 */

// Venice coordinate bounds (plain object for SSR compatibility)
export const VENICE_BOUNDS_COORDS = {
  south: 45.406,
  west: 12.285,
  north: 45.472,
  east: 12.395,
} as const;

export const VENICE_CENTER: [number, number] = [45.438, 12.335];

// Helper function to create Leaflet LatLngBounds (client-side only)
export const getVeniceBounds = async () => {
  if (typeof window === 'undefined') {
    throw new Error('getVeniceBounds can only be called on the client side');
  }
  const L = await import('leaflet');
  return L.default.latLngBounds(
    [VENICE_BOUNDS_COORDS.south, VENICE_BOUNDS_COORDS.west],
    [VENICE_BOUNDS_COORDS.north, VENICE_BOUNDS_COORDS.east]
  );
};

// API Configuration
export const API_CONFIG = {
  TIMEOUT: 5000, // 5 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// Map Configuration
export const MAP_CONFIG = {
  DEFAULT_ZOOM: 16,
  MIN_ZOOM: 15,
  MAX_ZOOM: 19,
  WHEEL_DEBOUNCE_TIME: 50,
  WHEEL_PX_PER_ZOOM_LEVEL: 100,
  ZOOM_ANIMATION_THRESHOLD: 8,
  ZOOM_SNAP: 1,
  MAX_BOUNDS_VISCOSITY: 1.0,
} as const;

// Time Configuration
export const TIME_CONFIG = {
  DEFAULT_SPEED: 5, // Venice minutes per real second
  SPEEDS: {
    SLOW: 10,
    NORMAL: 60,
    FAST: 240,
  },
  START_HOUR: 8,
  START_MINUTE: 0,
} as const;

// Agent Configuration
export const AGENT_CONFIG = {
  MOVEMENT_COOLDOWN: 60000, // 60 seconds
  ANIMATION_BASE_SPEED: 100, // points per second at timeSpeed=60
  MARKER_RADIUS: 8,
  ROUTE_WEIGHT: 4,
} as const;

// Network Configuration
export const NETWORK_CONFIG = {
  EDGE_COLOR: "#666666",
  EDGE_WEIGHT: 2,
  EDGE_OPACITY: 0.4,
} as const;

// Environment URLs
export const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://127.0.0.1:8000";
};
