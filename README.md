# Graph Edit - Economy Simulation Node Editor

A node-based graph editor for building and simulating economy systems, inspired by Port Royale and similar simulation games, with a visual interface like Upload Labs.

## Features

- **Node-based editing**: Create source, process, and sink nodes with editable names
- **Pan & zoom**: Navigate your graph smoothly
- **Viewport rendering**: Grid coverage stays full-screen while panning and zooming; links render at negative coordinates and beyond the former fixed world bounds
- **Drag & drop**: Move nodes around intuitively
- **Connection visualization**: See resource flow at a glance
- **Port inventories**: Inspect and edit the item count on every input and output
- **Real-time simulation**: Configure per-node cycle timers and pause or resume the simulation
- **Round-robin routing**: Distribute output inventory evenly across connected inputs
- **Utilization and throughput**: Measure busy, starved, and blocked time plus operational flow rates for each port

## Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run simulation tests
npm test
```

The dev server will open at `http://localhost:5173`

## Usage

### Keyboard & Mouse
- **Double-click** canvas: Add a new node
- **Right-click + drag**: Pan the view
- **Scroll**: Zoom in/out
- **Click node**: Select
- **Drag node**: Move around
- **Click × button**: Delete node

### Adding Nodes
Use the panel on the right side:
- **Source**: Generates resources (wood, stone, food, etc.)
- **Process**: Transforms or combines inputs into outputs
- **Sink**: Consumes resources

Creating a node opens a port-count dialog. Source asks for Number of sources (outputs), Sink asks for Number of sinks (inputs), and Process asks for both input and output counts. Counts must be integers from 1 to 32. Defaults are one source output, one sink input, and two process inputs with one process output. Each count configures ports on one node, not separate independent nodes. Cancel or Escape closes without creating a node. Counts are remembered independently for each node type. Double-clicking the canvas opens source configuration and creates the node at the clicked canvas position after confirmation.

Each process cycle consumes the configured quantity from every input and creates the configured quantity on every output. Quantities default to one and are edited using each port's Cycle field. Every input must have its entire required quantity and every output must have space for its entire produced quantity before any items are consumed. Every port has independent inventory, capacity, routing, trends, and throughput metrics, with the same default 30-item capacity. Port counts are chosen at creation, not edited on existing nodes.

All node headers show their port counts. Nodes grow vertically with their content rather than clipping ports or the utilization footer. Full metric labels, process Supply-limited cycle rate rows, and applicable consumption and production ratio summaries remain inside the node boundary.

### Names, Inventory, and Timers
- Edit the name in the node header; Enter or leaving the field commits the change.
- Each port has an editable quantity and capacity (Limit), defaulting to 30 items. Quantity cannot exceed its limit, and a limit cannot be lowered below existing stock. See [Bounded Inventory and Distribution](#bounded-inventory-and-distribution).
- Each input and output inventory has a three-second trend measurement with noise filtering, hysteresis, and two-period confirmation. Hover over the status for net change and current and previous net rates. See [Flow and Trend Analysis](#flow-and-trend-analysis) for the calculations and examples.
- Each node shows utilization and cycles/second; inputs show received and used items/second, and outputs show produced and transferred items/second. See [Node Utilization and Throughput](#node-utilization-and-throughput) for definitions and reporting behavior.
- Set each node's cycle duration in seconds, from 0.1 to 86,400 (default: 1 second). Changing the duration resets the current cycle's progress.
- A source creates each output's configured Cycle quantity per cycle. Every output must have room for its full batch.
- A process consumes and produces each port's configured Cycle quantity per cycle. All input requirements and output headroom requirements must be satisfied before its timer runs. See [Process Recipe Ratios](#process-recipe-ratios).
- A sink consumes each input's configured Cycle quantity per cycle. Every input must have its full batch before any input is consumed. See [Source and Sink Ratios](#source-and-sink-ratios).
- Waiting nodes do not accumulate idle time. Unused input items and disconnected output items remain on their respective ports.
- Connecting an output immediately transfers as much inventory as connected inputs can accept. Subsequent output uses capped fair sharing, with round-robin assignment of leftover units. Excess remains on the output.
- The Simulation toggle pauses or resumes node timers. Connections and manual inventory edits still transfer items while paused.
- Graphs and inventories are held in memory; reloading the page resets them.

## Flow and Trend Analysis

### Inventory Flow

Each simulation update transfers available output stock, advances eligible node timers, transfers newly produced output, and then updates port trend measurements. Every node uses its configured per-port recipe quantities: sources produce on all outputs, processes consume all inputs and produce on all outputs, and sinks consume all inputs. A node waits if any input lacks its recipe quantity or any output lacks room for a complete recipe batch. An unconnected output does not prevent cycling while enough headroom remains.

Disconnected outputs retain their stock. Connecting an output immediately distributes as much stock as destination capacities permit. Distribution uses sorted headroom, whole-batch division, and round-robin remainder arithmetic, not a loop over individual items. Clicking an input port removes its incoming connections without removing its inventory.

All inventory changes go through `changeInventory` in [src/stores.js](src/stores.js). Each change updates the port count and adds the absolute size of the change to a running activity total. This includes production, consumption, transfers, and manual inventory edits. Each end of a transfer records its own activity.

### Process Recipe Ratios

Each input's Cycle field is the number of items consumed per completed cycle. Each output's Cycle field is the number produced. These controls apply to process, source, and sink nodes. Values must be positive safe integers; zero, fractions, negative values, and non-finite values are rejected. Defaults are one per port, preserving the original recipe.

The footer lists Consumption ratio and Production ratio in displayed port order. A consumption ratio of `2 : 3` and production ratio of `4 : 5` means each cycle consumes two items from Input 1 and three from Input 2, producing four items on Output 1 and five on Output 2. These are actual per-cycle quantities, not normalized proportions: `2 : 4` is not automatically reduced to `1 : 2`.

Cycle eligibility is calculated in whole batches:

```text
input-supported cycles = floor(input inventory / input recipe quantity)
output-supported cycles = floor(output headroom / output recipe quantity)
available cycles = min(all input-supported cycles, all output-supported cycles)
completed cycles = min(timer-supported cycles, available cycles)
```

Consumption and production are applied atomically as `completed cycles * port recipe quantity`. Insufficient inventory on any input prevents partial consumption. Insufficient space on any output blocks all production, even if that output is not completely full. For example, an output producing five per cycle with only four spaces blocks processing. An input requirement above its capacity waits for inputs; an output quantity above its capacity blocks for output space. Increase the relevant capacity or reduce the recipe quantity to resolve an impossible batch; the editor does not silently resize buffers or discard stock.

Changing a recipe resets the current cycle's progress without changing inventory, connections, completed-cycle counts, or prior reports. Subsequent time accounting, production, consumption, and stock trends use the new quantities. A reporting window containing a recipe change can include work under both recipes. Output distribution still routes individual item counts using capped fair sharing; recipe quantities do not change connection fairness or require transfers to arrive as complete batches.

Recipes add one scalar quantity per port. Cycle-limit checks and supply estimates remain O(number of ports) per node, and consumption and production still use whole-batch arithmetic without per-item loops.

### Source and Sink Ratios

Sources have 1-32 output ports and no inputs. Edit each output's Cycle field to set its production quantity. For example, two source outputs with quantities `2 : 5` produce two and five items per shared cycle. Every output must have enough headroom for its own batch; if one is blocked, all source production waits. The production ratio is shown in the node footer.

Sinks have 1-32 input ports and no outputs. Edit each input's Cycle field to set its consumption quantity. For example, two sink inputs with quantities `2 : 3` consume two and three items per shared cycle. All inputs must have complete batches; if any input is short, none are consumed and the sink is Starved. The consumption ratio is shown in the footer.

One node has one timer: its ports do not run independently. Use separate nodes when independent timing or independent starvation/backpressure behavior is needed. Default single-port source and sink nodes behave as before, with one item per cycle until their Cycle quantities are changed.

The same recipe validation, progress-reset behavior, 30-item default capacities, capped routing, per-port flow/trend accounting, and utilization rules apply to all node types. Source and sink counts are selected at creation; recipe quantities remain editable on existing nodes. The supply-limited cycle estimate remains a process-node metric, while source and sink nodes show actual per-port production or consumption rates.

### Node Utilization and Throughput

Utilization measures how simulation time is spent, rather than treating every idle node as inefficient. Each node accumulates three mutually exclusive states:

| State | Meaning |
| --- | --- |
| Busy | The cycle timer is advancing, including partial cycles that have not produced or consumed an item yet. |
| Starved | Required input inventory is missing. |
| Blocked | Output capacity prevents another cycle. This takes precedence when inputs are also missing. |

The node publishes a fresh report after at least three seconds of simulation time, using the same clock and cadence as inventory trends:

```text
elapsed time = busy time + starved time + blocked time
busy percent = 100 * busy time / elapsed time
starved percent = 100 * starved time / elapsed time
blocked percent = 100 * blocked time / elapsed time
waiting percent = starved percent + blocked percent
cycle rate = completed cycles / elapsed seconds
```

The UI shows Busy, Starved, Blocked, Total waiting time, Completed cycle rate, and Configured maximum (`1000 / intervalMs`, in cycles/s). Values show Measuring or `--` until the first report. Reports are unsmoothed window measurements; the trend EMA and two-period confirmation do not delay utilization or throughput.

If inputs run out or output capacity fills partway through a large update, busy time stops at the final eligible cycle's completion. The remaining update time is classified as Starved or Blocked. For example, a source with a one-second cycle and space for one item, advanced by three seconds, reports 33.3% Busy and 66.7% Blocked. With partial progress carried from an earlier update, only the remaining time needed to finish that cycle is charged to the new update. A node with a five-second cycle can be 100% Busy during a three-second report while completing zero cycles.

This accounting follows the existing batched simulation: routing occurs before and after node cycles. It does not invent intermediate arrivals or repeatedly execute a whole network within one delayed update. An input replenished or output drained by the final routing pass affects eligibility on the following update.

Operational flow is measured separately from stock trends and gross activity:

| Port | UI | Calculation |
| --- | --- | --- |
| Input | Received | Items actually transferred into this input / elapsed seconds. |
| Input | Consumed | Items consumed by node cycles from this input / elapsed seconds. |
| Output | Produced | Items created by node cycles on this output / elapsed seconds. |
| Output | Transferred | Items actually transferred from this output / elapsed seconds. |

`changeInventory` tags each batch as a transfer, production, consumption, or manual edit. Direct manual quantity edits do not count as operational inflow, consumption, production, or outflow, but retain their existing effect on stock trends and gross activity. If edited inventory subsequently transfers along a connection, that actual movement counts as transfer flow. Capacity changes and unsuccessful transfers do not create flow; transfers triggered by a capacity increase do count.

For example, an input receiving and consuming three items in three seconds reports Received 1/s and Consumed 1/s even though its net stock change is zero. An output immediately transferring everything it produces reports both production and outflow while its inventory trend remains Stable.

Process input rates are kept separate, not added together. The displayed Supply-limited cycle rate normalizes each observed inflow by that input's recipe quantity:

```text
input-supported cycle rate = input inflow / input recipe quantity
supply-limited cycle rate = min(all input-supported cycle rates, configured maximum cycle rate)
```

This is a supply estimate, not a promise of actual throughput: output backpressure can reduce production, while stored inputs can temporarily support a higher actual rate. It describes cycles/s, not the sum of items across multiple outputs. At a sustained cycle rate, each output's expected production rate is `cycles/s * output recipe quantity`. Source nodes have no input supply limit and sinks have no production rate. Changing cycle duration or recipe quantities updates estimates immediately; measured rates still describe the completed report interval.

Each three-second report publishes accumulated counters and resets them. Delayed updates produce one report normalized by their actual elapsed time. Pausing excludes wall-clock pause time from utilization and rate denominators; no extra timers are introduced. Real transfers made by connecting nodes or editing inventory while paused remain in pending flow counters and are included in the next report after resuming. Direct edits themselves remain excluded from operational rates.

The implementation stores fixed-size counters and the latest report per node and port. Time accounting is O(1) per node update and operational-flow accounting is O(1) per batch mutation, regardless of item count. Publishing across a graph costs O(nodes + ports), with O(1) persistent measurement state per node and port. There are no item records, event histories, or sample buckets. These are accounting costs in addition to the existing capped-routing algorithm.

### Bounded Inventory and Distribution

Every input and output starts with a capacity of **30 items**, independent of its node's cycle duration. The node's Qty and Limit fields edit the inventory and capacity of that port. Capacities must be nonnegative safe integers, up to `Number.MAX_SAFE_INTEGER`; zero disables storage on that port. Quantity edits above capacity and capacity edits below existing stock are rejected without discarding items. Increasing capacity immediately retries pending transfers, even when the simulation is paused.

Available input space is calculated from current inventory rather than stored separately:

```text
headroom = max(0, capacity - inventory)
```

For each output, capped fair sharing (water-filling) distributes the available quantity:

1. Retrieve its connected inputs from the cached adjacency index and calculate their current headrooms. Exclude full inputs.
2. Sort eligible inputs by ascending headroom. Divide the remaining quantity by the number of remaining inputs to obtain a whole-item share.
3. If the smallest headroom is at most the share, allocate that headroom, subtract it from the remaining quantity, and remove that input from further sharing. Continue along the sorted list.
4. Once all remaining inputs can accept the whole-item share, assign it to each in one batch.
5. Assign the remaining units in connection order, starting at the output's round-robin cursor and skipping full inputs. There are fewer leftover units than eligible destinations. Save the position after the last remainder recipient for the next batch.
6. Apply the allocations immediately and subtract only the transferred quantity from the output. Any excess remains stored; nothing is discarded.

Allocation is fair by additional quantity received, subject to headroom; it does not try to equalize the destinations' final stock levels. A connection or manual edit triggers an immediate pass, so stock present before connecting the first destination can move before later destinations are connected.

For example, distribute 1,000 output items across ten connected inputs after raising their limits. If the first two inputs have 20 and 80 free spaces and each remaining input has at least 113, allocations are 20, 80, four shares of 113, and four shares of 112. The cursor chooses which four receive the extra item. If all ten inputs instead have only 50 free spaces, transfer 500 and retain 500 on the output.

Sources pause when any output lacks room for its recipe batch. Sinks wait when any input lacks its consumption batch. Processes limit completed cycles to available input and output recipe batches, checking all requirements before consuming inputs. With the default one-item recipe, a process with 10 items on each input and room for only one output completes at most one cycle, leaving nine items on each input. Blocked nodes do not accumulate timer progress for a future burst. Capacity-zero outputs cannot produce, even when connected.

Routing runs before and after node cycles. Downstream consumption frees headroom for the post-cycle transfer pass; upstream production can resume on a following update. Multiple producers observe the inventory changes made by earlier allocations, preventing shared-input overflow. Producers are visited in node order: fairness is guaranteed among destinations of one output, not between competing producers.

Full ports show Full, and sources/processes lacking room for any complete output batch show Waiting for output space separately from their inventory trend. Rejected edits and unsuccessful transfers do not count as activity. Full, stationary buffers eventually show a Stable trend even though flow is blocked.

For `k` connected destinations, each distribution takes O(k log k) work and O(k) temporary allocation space, independent of the quantity distributed. Connection adjacency is rebuilt in O(E) only when the connections array changes; current headroom is always recalculated. Persistent capacity state is O(1) per port and the adjacency index is O(E). No per-item objects or headroom history are retained. Whole-batch arithmetic also avoids summing all capacities into a potentially oversized total. Existing graph snapshots and trend state remain isolated from later capacity and inventory edits.

### Net Rate Versus Activity

Both input and output ports measure the following after at least three seconds of simulation time:

```text
net change = ending inventory - inventory at the previous measurement
net rate = net change / elapsed seconds
activity rate = (total additions + total removals) / elapsed seconds
```

For example, receiving 100 items and consuming 100 items in three seconds gives zero net change but an activity rate of approximately 66.67 items/second. Net rate describes accumulation or depletion; activity describes how busy the port is. Stored inventory is not the denominator of either rate.

An output that immediately transfers all production can therefore remain Stable at zero inventory despite having substantial activity. A process input that receives items while waiting for its other input has a positive net rate. Whether that becomes an Increasing indicator depends on the noise threshold and confirmation rules below.

### Smoothed Activity and Noise Threshold

Activity is smoothed using an exponential moving average (EMA):

```text
first smoothed activity = first measured activity rate
next smoothed activity = 0.25 * current activity rate
                       + 0.75 * previous smoothed activity
entry threshold = max(0.5 items/second, 0.01 * smoothed activity)
exit threshold = entry threshold / 2
```

The EMA blends the latest observation with the previous smoothed value, reducing abrupt threshold changes after individual bursts. For example, a previous smoothed rate of 100 items/second and a new activity rate of 20 produce a smoothed rate of 80. It stores one value, not a list of samples. The 25% weighting applies once per measured period, including a delayed period.

This replaces both the old stock-percentage threshold and the unfiltered positive/negative net-change rule. It never divides by previous net change, so a zero previous net rate is safe. Large stored stock alone does not raise the threshold. Large actual flow does raise it, preventing a few items of imbalance from changing the indicator in an otherwise busy system. Manual stock edits count as activity and can temporarily raise the threshold; the EMA decays toward subsequent activity measurements.

### Hysteresis and Confirmation

At every measurement, select a candidate state using these rules in order:

1. A net rate at or above the entry threshold proposes Increasing.
2. A net rate at or below the negative entry threshold proposes Decreasing.
3. An existing Increasing state is retained while the net rate stays above the positive exit threshold.
4. An existing Decreasing state is retained while the net rate stays below the negative exit threshold.
5. Otherwise, propose Stable.

Every change of state requires the same candidate in two consecutive measured periods. The first supporting period leaves the displayed state unchanged. A different candidate restarts confirmation; a candidate matching the displayed state clears pending confirmation. This applies to entering a trend, returning to Stable, and reversing direction.

Ports initially show Measuring. The first measurement initializes the displayed state to Stable and can record the first pending trend confirmation. A sustained trend can therefore first appear after approximately six seconds. Hysteresis uses different entry and exit thresholds so a rate near the entry boundary does not repeatedly switch the indicator. Raw net rate measurements still update every period even while the displayed state is held.

| Scenario | Result |
| --- | --- |
| One extra item every three seconds, with low activity | About +0.333 items/second, below the 0.5 entry floor; remains Stable. |
| Three extra items every three seconds, with low activity | +1 item/second; becomes Increasing after two supporting periods and stays Increasing as stock grows. |
| Roughly two million items/second of activity with +1 item/second net | Threshold is roughly 20,000 items/second; remains Stable. |
| Increasing at a 0.5 entry threshold, then +0.333 items/second | Remains Increasing because the rate exceeds the 0.25 exit threshold. |
| An Increasing port has zero net flow for two periods | Returns to Stable after confirmation. |

These examples assume the stated activity level; a prior burst can temporarily leave a higher smoothed threshold.

### Timing, Storage, and Verification

The clock advances with simulation time. Pausing stops both node timers and trend measurement. Manual edits and connections can still move inventory while paused; their net changes and activity totals are included in the next measurement after resuming.

If an update is delayed, one measurement covers the actual elapsed duration and normalizes both rates by that duration. It counts as one observation, not several invented three-second confirmations. The next measurement starts from that endpoint.

Each port stores a fixed number of scalar values: baseline inventory, elapsed time, running activity total, current and previous measured results, smoothed activity, thresholds, and pending confirmation state. Memory is O(1) per port, each inventory mutation adds O(1) trend-accounting work, and each measurement takes O(1) per port. These costs do not grow with item counts or runtime. There are no sample arrays, history buckets, or per-item trend calculations. These bounds describe trend tracking, not the separate graph-routing or rendering costs.

The implementation is in [src/stores.js](src/stores.js), with behavioral coverage in [src/stores.test.js](src/stores.test.js). Run `npm test` to verify smoothing, large-flow noise suppression, entry and exit behavior, interrupted confirmations, reversals, transfers, delayed updates, snapshot isolation, capacity validation, backpressure, fair capped distribution, shared inputs, topology-cache invalidation, trillion-item batches, utilization time splits, partial cycles, operational rate reporting, and manual-edit exclusions. Small reference cases compare the batch allocator with item-by-item round robin in tests only.

## Project Structure

```
src/
├── main.js              # Entry point
├── App.svelte           # Root component
├── stores.js            # Svelte stores (state management)
└── components/
    ├── Canvas.svelte    # Main editing canvas
    ├── Node.svelte      # Individual node component
    └── Connection.svelte # Connection/edge rendering
```

## Architecture

### State Management (stores.js)
- **graph**: Nodes and connections
- **ui**: Pan, zoom, selection, dragging state

### Component Hierarchy
```
App
├── Canvas
│   ├── Node (multiple)
│   └── Connection (multiple)
└── Panel (controls & info)
```

## Development

### Current Focus
- Node rendering and interactions
- Connection visual feedback
- Pan/zoom smoothness

### Next Steps
See [ROADMAP.md](./ROADMAP.md) for detailed development plan.

## Future Features
- [ ] Interactive connection drawing (drag from port to port)
- [ ] Port type validation
- [x] Simulation engine with data flow
- [ ] Save/load functionality
- [ ] Undo/redo
- [ ] Custom node types

## Inspired By
- **Upload Labs**: Node-based visual programming
- **Port Royale**: Economic simulation with trading chains
- **Game theory**: Supply chain optimization

## License
MIT
