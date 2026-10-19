# Port Visibility & Connection Line Fixes

## Changes Made

### 1. **Larger Port Dots** - Much Easier to Click
- **Idle size**: Increased from 8px → 14px
- **Hover size**: Increased from 12px → 18px (regular hover)
- **Drop target**: Enlarged to 20px with glowing effect during drag
- **Added**: `flex-shrink: 0` to prevent ports from shrinking in flexbox

### 2. **Port Identification**
- Added `data-port-id` attribute to each port:
  - Format: `output-{nodeId}-{outputId}` or `input-{nodeId}-{inputId}`
  - Example: `output-node-1234567890-output` or `input-node-1234567890-inputA`
- Enables dynamic DOM querying to find actual port elements

### 3. **Connection Lines Now Link Actual Port Dots**
- **Before**: Lines went from node edge to node edge (approximation)
- **After**: Lines draw from the CENTER of each port dot

**How it works:**
1. Connection component queries DOM for port elements using `data-port-id`
2. Gets `getBoundingClientRect()` of each port (screen coordinates)
3. Calculates center: `left + width/2, top + height/2`
4. Converts to canvas coordinates: `(screenX - panX) / zoom`
5. Draws SVG line between the actual port centers
6. Reacts to pan/zoom changes automatically

### 4. **Enhanced Visual Feedback During Drag**
- Hover state on input ports now shows:
  - Larger glow (20px)
  - Inset highlight for depth
  - Brightness boost (1.3x)
  - Stronger box-shadow

### 5. **Connection Line Styling**
- Increased stroke width: 2px → 2.5px (more visible)
- End dots increased: 4px radius → 5px radius
- Added `stroke-linecap: round"` for smoother appearance

## Technical Details

### Port Position Calculation
```javascript
const element = document.querySelector(`[data-port-id="${portId}"]`)
const rect = element.getBoundingClientRect()
const centerX = rect.left + rect.width / 2
const centerY = rect.top + rect.height / 2

// Convert screen to canvas coordinates
const canvasX = (centerX - ui.panX) / ui.zoom
const canvasY = (centerY - ui.panY) / ui.zoom
```

### Reactivity
Connection positions update whenever:
- Nodes move (graph changes)
- Pan position changes (ui.panX/panY)
- Zoom level changes (ui.zoom)

This ensures connections stay connected even when nodes are dragged or view is panned/zoomed.

### Performance Note
- Queries DOM for each connection on every update
- At ~100+ connections, consider caching port positions
- Future optimization: store port positions in node data

## Testing Checklist
- [ ] Ports are clearly visible and easy to click
- [ ] Hover glow effect is prominent on input ports during drag
- [ ] Connection lines precisely link port dots, not node edges
- [ ] Lines update correctly when nodes are dragged
- [ ] Lines update correctly when panning/zooming
- [ ] Multiple connections from same output all position correctly
- [ ] Connection dots align with port dots exactly

## Next Steps
1. Test with various node layouts
2. Add connection deletion (click line to delete)
3. Consider performance optimization if > 50 connections
4. Add port type validation to prevent invalid connections
