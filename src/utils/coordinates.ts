/**
 * Centralized coordinate transformation utilities for consistent zoom handling
 */

export interface ViewportState {
  scale: number;
  pos: { x: number; y: number };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert screen/stage coordinates to canvas coordinates
 * This accounts for pan and zoom transformations
 */
export function screenToCanvas(screenPoint: Point, viewport: ViewportState): Point {
  return {
    x: (screenPoint.x - viewport.pos.x) / viewport.scale,
    y: (screenPoint.y - viewport.pos.y) / viewport.scale
  };
}

/**
 * Convert canvas coordinates to screen/stage coordinates
 * This applies pan and zoom transformations
 */
export function canvasToScreen(canvasPoint: Point, viewport: ViewportState): Point {
  return {
    x: canvasPoint.x * viewport.scale + viewport.pos.x,
    y: canvasPoint.y * viewport.scale + viewport.pos.y
  };
}

/**
 * Get the pointer position in canvas coordinates from a Konva stage
 */
export function getCanvasPointer(stage: any, viewport: ViewportState): Point | null {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  
  return screenToCanvas(pointer, viewport);
}

/**
 * Scale a size value according to zoom level
 * Useful for maintaining consistent visual sizes (like handles, hitboxes) regardless of zoom
 */
export function scaleInvariant(size: number, scale: number): number {
  return size / scale;
}

/**
 * Calculate distance between two points in canvas space
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Check if a point is within a rectangle with optional tolerance
 */
export function isPointInRect(
  point: Point, 
  rect: { x: number; y: number; width: number; height: number },
  tolerance: number = 0
): boolean {
  return point.x >= rect.x - tolerance &&
         point.x <= rect.x + rect.width + tolerance &&
         point.y >= rect.y - tolerance &&
         point.y <= rect.y + rect.height + tolerance;
}

/**
 * Check if a point is within a circle
 */
export function isPointInCircle(
  point: Point,
  center: Point,
  radius: number,
  tolerance: number = 0
): boolean {
  return distance(point, center) <= radius + tolerance;
}