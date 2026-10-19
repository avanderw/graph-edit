# Connection Line Coordinate Fix

## The Problem
Connection lines were appearing offset to the bottom-left instead of connecting port-to-port precisely.

## Root Cause
The coordinate transformation was not accounting for the canvas element's actual position on the screen. If the canvas element wasn't at exactly viewport (0, 0), the calculation would be off.

## The Solution
Modified the `getPortPosition()` function in Connection.svelte to:

1. **Get port screen position** via `getBoundingClientRect()` relative to viewport
2. **Get canvas element screen position** to establish a reference frame
3. **Calculate relative position**: `portScreenX - canvasScreenX` (now relative to canvas, not viewport)
4. **Apply inverse transform**: Account for pan and zoom applied to the canvas-content div

### Before (Incorrect)
```javascript
const rect = element.getBoundingClientRect()
const centerX = rect.left + rect.width / 2  // viewport relative
const centerY = rect.top + rect.height / 2

// Wrong: assumes canvas is at viewport (0,0)
const canvasX = (centerX - $ui.panX) / $ui.zoom
```

### After (Correct)
```javascript
const portRect = portElement.getBoundingClientRect()
const canvasRect = canvasElement.getBoundingClientRect()

// Calculate relative to canvas element, not viewport
const portScreenX = portRect.left - canvasRect.left + portRect.width / 2
const portScreenY = portRect.top - canvasRect.top + portRect.height / 2

// Now apply transform correctly
const canvasX = (portScreenX - $ui.panX) / $ui.zoom
const canvasY = (portScreenY - $ui.panY) / $ui.zoom
```

## Why This Matters
- Canvas element position changes if page has scrolling, margins, or other content above it
- Getting viewport-relative coordinates and treating them as canvas-relative creates an offset
- By getting the canvas element's position first, we establish the correct coordinate frame

## Testing
Connection lines should now:
- Connect precisely from port dot to port dot ✓
- Stay centered on ports when nodes are dragged
- Update correctly when panning/zooming
- Work regardless of where the canvas is positioned on the page
