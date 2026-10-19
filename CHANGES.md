# Interactive Connection Drawing - Implementation Summary

## Viewport Grid and Connection Rendering - 2026-10-19

- Grid and connection SVG surfaces now cover the canvas viewport instead of moving or scaling a finite drawing rectangle out of view.
- The grid pattern, connection group, and HTML nodes use matching pan and zoom transforms, keeping spacing, ports, links, and drag previews aligned.
- Removed the 10,000-pixel connection surface limit. Connections can cross the viewport even when their endpoints lie outside it.
- Connection visibility now depends on valid port positions rather than positive coordinates, allowing links at zero and negative world positions.
- SVG surfaces follow viewport resizing; only the canvas viewport clips off-screen content.

## Source and Sink Port Counts and Ratios - 2026-10-19

- Source creation now asks for 1-32 sources (output ports), and sink creation asks for 1-32 sinks (input ports). Each count configures ports on one node. Defaults remain one output/input.
- A shared dialog remembers counts per node type. Canvas double-click opens source configuration at the clicked position; Cancel and Escape do not create a node.
- All source outputs and sink inputs expose editable Cycle quantities and applicable ratio summaries, with the same validation and progress-reset rules as process recipes.
- Sources produce all output batches atomically; any output lacking headroom blocks the source. Sinks consume all input batches atomically; any missing input batch starves the sink. Ports share the node's timer.
- New ports retain independent capacity, inventory, routing, trends, and throughput accounting. Existing single-port identifiers and default behavior remain compatible.
- See [Source and Sink Ratios](README.md#source-and-sink-ratios) for shared-cycle semantics and examples.

## Per-Port Process Recipe Ratios - 2026-10-19

- Each process input and output has an editable positive integer Cycle quantity, defaulting to one. Footer summaries show consumption and production ratios in port order.
- Cycle counts are limited by `floor(input stock / consumption)` and `floor(output headroom / production)` across every configured port. Updates consume and produce full batches atomically.
- A partially filled output can block processing when it lacks space for one complete batch. Recipes larger than buffer capacities wait safely until capacity or recipe quantities change.
- Input consumption, output production, utilization, and trends use actual recipe quantities. Supply-limited cycles/second divides each input's observed inflow by its consumption requirement.
- Recipe edits preserve inventory and existing measurements while resetting current cycle progress. Whole-batch arithmetic and fixed per-port state avoid item-by-item accounting.
- Tests cover non-unit multi-output ratios, incomplete inputs, batch headroom, recipe validation, snapshot isolation, progress resets, and large output batches.
- See [Process Recipe Ratios](README.md#process-recipe-ratios) for formulas, examples, and editing semantics.

## Configurable Process Ports and Node Layout - 2026-10-19

- Creating a process opens a dialog for 1-32 inputs and 1-32 outputs, defaulting to two inputs and one output. Cancel and Escape do not create a node.
- Each process stores its own port definitions. Inventory, capacity, trends, flow accounting, connections, and supply estimates use those definitions.
- Each cycle consumes one item from every input and produces one on every output atomically. Any missing input or full output pauses the entire cycle.
- Nodes grow with content instead of overflowing a fixed-height boundary. Performance rows use explicit label/value columns, and the supply-limited cycle rate and recipe remain within the node.
- Port flow labels now read Received, Consumed, Produced, and Transferred; footer rows show Total waiting time, Completed cycle rate, and Configured maximum.
- Tests cover configured-port initialization, multi-output production and backpressure, added-port connections, invalid counts, and default-node compatibility.

## Node Utilization and Operational Throughput - 2026-10-19

- Nodes publish Busy, Starved, Blocked, total Waiting percentages, and actual completed cycles/second every three seconds of simulation time. The configured maximum cycle rate is shown separately.
- Partial cycles count as busy time. Large updates split busy and waiting time at the point where input stock or output headroom is exhausted; output blockage takes precedence if both requirements fail.
- Inputs show received and consumed items/second; outputs show produced and transferred items/second. Manual quantity edits are excluded from operational rates while actual transfers of edited stock still count.
- Process nodes show a supply-limited cycle estimate using the minimum of per-input inflow and configured maximum cycle rate, without combining unlike inputs.
- Counters use the existing simulation clock, reset after publication, normalize delayed updates by actual elapsed time, and retain only fixed-size state and the latest report. No per-item accounting or event history is added.
- Tests cover utilization partitions, partial cycles, delayed updates, balanced inventories with nonzero throughput, manual edits, snapshot isolation, and trillion-item flow accounting.
- See [Node Utilization and Throughput](README.md#node-utilization-and-throughput) for formulas, timing, UI labels, and limitations.

## Bounded Inventory and Capped Distribution - 2026-10-19

- Every input and output defaults to a 30-item capacity, with editable Qty and Limit fields and separate Full/Output full indicators.
- Safe-integer limits and quantities are validated; limits cannot be lowered below current stock and inventory edits cannot exceed capacity. Zero capacity disables storage.
- Capped fair sharing sorts destination headrooms, fills small destinations, divides the remaining batch, and distributes leftover units with a round-robin cursor. Untransferred stock remains on the output.
- Sources pause at full output; processes require output headroom before consuming inputs. Blocked timers do not bank time. Downstream consumption and raised capacities allow transfers to resume automatically.
- Cached connection adjacency avoids repeated whole-graph connection scans. Allocation takes O(k log k) work and O(k) temporary space for k destinations, independent of item quantity.
- Trend activity includes only actual mutations. Documentation and tests cover 1,000-item and trillion-item distributions, shared-input safety, cache invalidation, overflow retention, and stock conservation.
- See [Bounded Inventory and Distribution](README.md#bounded-inventory-and-distribution) for the algorithm, examples, validation policy, and backpressure behavior.

## Flow and Trend Analysis Update - 2026-10-19

- Input and output inventories measure net changes over three-second periods and normalize rates by actual elapsed simulation time.
- Gross activity counts additions plus removals, including production, consumption, transfers, and manual edits, even when net change is zero.
- Activity uses an exponential moving average: 25% current activity and 75% previous smoothed activity, initialized from the first measurement.
- Trend entry requires at least `max(0.5 items/second, 1% of smoothed activity)`. The exit threshold is half the entry threshold.
- Hysteresis retains established trends near their entry boundary. All state changes require two consecutive supporting measurements; interrupted confirmation resets.
- First measurement initializes Stable; a sustained trend can be confirmed after approximately six seconds. Delayed updates count as a single observation.
- Tracking uses fixed-size scalar state per port, without sample history or item-by-item calculations. Stock size is not used as a percentage denominator.
- This supersedes the earlier stock-average percentage rule and the sign-only net-change indicator. See [Flow and Trend Analysis](README.md#flow-and-trend-analysis) for formulas, examples, flow behavior, and performance limits.

## Changes Made

### 1. **Node.svelte** - Port Interactions
- **Output Ports** (source nodes): Now draggable
  - Click and drag from the green output dot to start drawing a connection
  - `handleOutputPortMouseDown` captures the port coordinates
  - Visual feedback: ports enlarge on hover, grab cursor when over them

- **Input Ports** (process nodes): Now droppable
  - Hover effects: input ports glow when hovering during connection drag
  - `handleInputPortMouseUp` detects drop and creates the connection
  - Prevents self-connections (source node can't connect to itself)

- **Port Event Handlers**:
  - `handleOutputPortMouseDown`: Initiates connection drag
  - `handleInputPortMouseOver`: Visual feedback on valid drop targets
  - `handleInputPortMouseOut`: Removes hover styling
  - `handleInputPortMouseUp`: Creates connection on drop
  - `handleMouseMove`: Updates preview line while dragging (from svelte:document)
  - `handleMouseUp`: Completes or cancels the connection drag

- **CSS Updates**:
  - `.io-port.out`: Grab cursor, active state = grabbing
  - `.io-port.hover`: Enlarges with glow when valid drop target

### 2. **stores.js** - Connection Drag State Management
- **startConnectionDrag(fromNodeId, fromOutput, fromX, fromY)**
  - Converts screen coordinates to canvas-relative coordinates
  - Accounts for pan (panX, panY) and zoom level
  - Stores initial connection state

- **updateConnectionDragPreview(toX, toY)**
  - Called on every mouse move during drag
  - Updates the preview line endpoint coordinates
  - Performs coordinate transformation (screen → canvas)

- **Added imports**: `get` from svelte/store (for accessing current store values)

### 3. **Canvas.svelte** - Preview Line Rendering
- Already had infrastructure for rendering preview connections
- Preview line shows as dashed gray line while dragging
- Properly transformed by pan/zoom effects
- Auto-updates reactively as draggingConnection state changes

## How It Works

### Connection Drawing Flow:
1. User clicks on a source node's **output port** (green dot)
2. `handleOutputPortMouseDown` fires:
   - Gets port screen coordinates via `getBoundingClientRect()`
   - Converts to canvas coordinates using pan/zoom
   - Stores in `ui.draggingConnection`
3. User moves mouse → `handleMouseMove` fires (from svelte:document)
   - Calls `updateConnectionDragPreview` with current mouse coords
   - Converts to canvas coordinates
   - Updates `draggingConnection.toX/toY`
4. Canvas reacts automatically, preview line follows cursor
5. User hovers over process node's **input port** (blue dot)
   - `handleInputPortMouseOver` adds `.hover` class (glow effect)
6. User releases mouse over input port
   - `handleInputPortMouseUp` fires
   - Creates the connection if valid (not self-connection)
   - Clears `draggingConnection` state

### Coordinate System:
- Screen coordinates: clientX, clientY (relative to viewport)
- Canvas coordinates: adjusted for pan (subtract panX/panY) and zoom (divide by zoom)
- SVG draws in canvas coordinate space due to parent transform

## Visual Feedback
- **Dragging**: Dashed gray line from start to cursor
- **Valid drop target**: Input port glows and enlarges
- **Ports idle**: Small dots (8px), hint text in panel
- **Ports hover**: Enlarge to 12px with enhanced cursor

## Testing Checklist
- [ ] Drag from source output to process input → connection created
- [ ] Pan while dragging → preview line follows correctly
- [ ] Zoom while dragging → coordinates scale properly
- [ ] Hover over process input during drag → glow effect shows
- [ ] Release outside valid port → no connection created
- [ ] Try to self-connect source to itself → prevented
- [ ] Multiple connections from same output → all work
- [ ] Delete node with connections → all connections removed

## Next Steps
1. Test the connection drawing thoroughly
2. Add connection deletion on click
3. Implement port type validation (e.g., prevent invalid resource type connections)
4. Add context menu for more connection options
5. Optimize connection rendering for many nodes
