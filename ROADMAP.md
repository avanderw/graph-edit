# Graph Edit - Development Roadmap

## Current Phase: Foundation & Interactions
Focus: Get node rendering and interactions right before building out simulation logic.

### ✅ Completed
- [x] Svelte + Vite project scaffold
- [x] Canvas with grid background
- [x] Pan & zoom controls
- [x] Basic node rendering (source, process, output types)
- [x] Node dragging
- [x] Node selection
- [x] Node deletion
- [x] Connection rendering (basic line drawing)
- [x] UI controls panel

---

## Phase 1: Node Interactions & Connection System
**Goal:** Perfect the node UX, make connections draggable and interactive.

### TODO
- [ ] **Connection Drawing**
  - [ ] Implement click-and-drag from output port to input port
  - [ ] Show snap/drop zones when hovering over compatible ports
  - [ ] Validate connection types (prevent circular deps, multiple inputs)
  - [ ] Visual feedback for valid/invalid connections
  
- [ ] **Node Port System**
  - [ ] Implement proper Input/Output port system on nodes
  - [ ] Dynamic port generation based on node type
  - [ ] Port highlighting on hover
  - [ ] Port data type validation

- [ ] **Context Menu**
  - [ ] Right-click context menu on canvas (add different node types)
  - [ ] Right-click on nodes (duplicate, configure, delete, etc.)
  - [ ] Right-click on connections (delete)

- [ ] **Keyboard Shortcuts**
  - [ ] Delete key to remove selected node
  - [ ] Ctrl+D to duplicate node
  - [ ] Ctrl+Z / Ctrl+Y undo/redo

---

## Phase 2: Node Types & Data Flow
**Goal:** Build out economy-simulation node types with data flowing between them.

### TODO
- [ ] **Source Nodes**
  - [ ] Resource generators (wood, stone, gold, etc.)
  - [ ] Configurable output rates
  - [ ] Time-based production ticks

- [ ] **Process Nodes**
  - [ ] Combine multiple inputs into outputs (crafting)
  - [ ] Transformation nodes (refine ore -> metal)
  - [ ] Storage nodes (warehouses, stockpiles)
  - [ ] Market nodes (trading, pricing)

- [ ] **Output Nodes**
  - [ ] Sinks/consumers (build a ship, feed population)
  - [ ] Graphs/charts to visualize resource flow
  - [ ] Goals/win conditions

- [ ] **Data Types**
  - [ ] Resource types (wood, stone, gold, food, etc.)
  - [ ] Type validation on connections
  - [ ] Data quantity/flow rates

---

## Phase 3: Simulation Engine
**Goal:** Run the economy simulation and visualize data flow.

### TODO
- [ ] **Simulation Tick System**
  - [ ] Discrete time steps
  - [ ] Propagate data through node graph
  - [ ] Handle queuing/buffering at nodes

- [ ] **Data Visualization**
  - [ ] Display current resource amounts in nodes
  - [ ] Animate flow along connections
  - [ ] Number/quantity displays on connection lines
  - [ ] Real-time update as simulation runs

- [ ] **Simulation Controls**
  - [ ] Play/Pause button
  - [ ] Speed control (1x, 2x, 4x)
  - [ ] Step through single ticks
  - [ ] Reset simulation

- [ ] **Performance**
  - [ ] Optimize for large graphs (100+ nodes)
  - [ ] Efficient update propagation
  - [ ] Cull off-screen rendering

---

## Phase 4: Save/Load & Persistence
**Goal:** Save graphs and simulations for later use.

### TODO
- [ ] **Export/Import**
  - [ ] Save graph as JSON
  - [ ] Load from JSON
  - [ ] Share graphs via URL/code
  - [ ] Export as image/SVG

- [ ] **Local Storage**
  - [ ] Auto-save to browser localStorage
  - [ ] Version history (snapshots)
  - [ ] Named saves

---

## Phase 5: Advanced Features (Nice to Have)
- [ ] **Advanced Node Types**
  - [ ] Conditional/logic nodes (if/then)
  - [ ] Delay nodes
  - [ ] Merging/splitting flows
  - [ ] Custom scripted nodes

- [ ] **Analytics**
  - [ ] Track metrics over time
  - [ ] Resource balance graphs
  - [ ] Bottleneck detection

- [ ] **Multiplayer/Collaboration**
  - [ ] Real-time collaborative editing
  - [ ] Shared simulations

- [ ] **UI Polish**
  - [ ] Better node styling/themes
  - [ ] Animation transitions
  - [ ] Node presets/templates

---

## Technical Debt & Refactoring
- [ ] Extract components further (NodeInput, NodeOutput, etc.)
- [ ] Implement proper type system for nodes
- [ ] Add unit tests for store logic
- [ ] Optimize re-rendering with Svelte reactivity

---

## Next Step
**Start with Phase 1:** Get the connection drawing working smoothly. This is critical UX that needs to feel right before scaling up.

1. Implement drag-from-port logic
2. Add snap zones on ports
3. Test with a few sample connections
4. Polish the visual feedback

Then gather feedback before moving to Phase 2.
