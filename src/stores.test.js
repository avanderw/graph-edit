import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { get } from 'svelte/store'
import {
  graph, addNode, addConnection, removeConnection, advanceSimulation,
  updatePortInventory, updatePortCapacity, updateNodeName, updateNodeInterval,
  updateRecipeQuantity, getSupplyLimitedCycleRate
} from './stores.js'

beforeEach(() => graph.set({ nodes: [], connections: [] }))

function createNode(type) {
  addNode(type, 0, 0)
  return get(graph).nodes.at(-1).id
}

function readNode(id) {
  return get(graph).nodes.find(node => node.id === id)
}

test('source retains disconnected inventory and respects its timer', () => {
  const source = createNode('source')
  advanceSimulation(999)
  assert.equal(readNode(source).inventory.outputs.output, 0)
  advanceSimulation(1)
  assert.equal(readNode(source).inventory.outputs.output, 1)
  advanceSimulation(2500)
  assert.equal(readNode(source).inventory.outputs.output, 3)
  assert.equal(readNode(source).elapsedMs, 500)
})

test('connecting drains all stored output into the input immediately', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  advanceSimulation(5000)
  addConnection(source, 'output', sink, 'input')
  assert.equal(readNode(source).inventory.outputs.output, 0)
  assert.equal(readNode(sink).inventory.inputs.input, 5)
  assert.deepEqual(readNode(sink).inventory.outputs, {})
})

test('round robin shares batches and remembers the next recipient', () => {
  const source = createNode('source')
  const first = createNode('sink')
  const second = createNode('sink')
  const third = createNode('sink')
  for (const sink of [first, second, third]) addConnection(source, 'output', sink, 'input')
  updatePortInventory(source, 'outputs', 'output', 8)
  assert.deepEqual([first, second, third].map(id => readNode(id).inventory.inputs.input), [3, 3, 2])
  updatePortInventory(source, 'outputs', 'output', 2)
  assert.deepEqual([first, second, third].map(id => readNode(id).inventory.inputs.input), [4, 3, 3])
})

test('sink consumes only on completed cycles and does not bank idle time', () => {
  const sink = createNode('sink')
  advanceSimulation(10000)
  updatePortInventory(sink, 'inputs', 'input', 2)
  advanceSimulation(500)
  assert.equal(readNode(sink).inventory.inputs.input, 2)
  advanceSimulation(500)
  assert.equal(readNode(sink).inventory.inputs.input, 1)
  advanceSimulation(5000)
  assert.equal(readNode(sink).inventory.inputs.input, 0)
  assert.equal(readNode(sink).completedCycles, 2)
})

test('process requires both inputs and retains its disconnected output', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 3)
  advanceSimulation(10000)
  assert.equal(readNode(process).inventory.inputs.inputA, 3)
  updatePortInventory(process, 'inputs', 'inputB', 2)
  advanceSimulation(500)
  assert.equal(readNode(process).inventory.outputs.output, 0)
  advanceSimulation(1500)
  assert.deepEqual(readNode(process).inventory, {
    inputs: { inputA: 1, inputB: 0 }, outputs: { output: 2 }
  })
})

test('source to process to sink moves inventory without losing items', () => {
  const source = createNode('source')
  const process = createNode('process')
  const sink = createNode('sink')
  addConnection(source, 'output', process, 'inputA')
  addConnection(source, 'output', process, 'inputB')
  addConnection(process, 'output', sink, 'input')
  advanceSimulation(1000)
  advanceSimulation(1000)
  advanceSimulation(1000)
  assert.equal(readNode(process).completedCycles, 1)
  assert.equal(readNode(sink).inventory.inputs.input, 1)
  advanceSimulation(1000)
  assert.equal(readNode(sink).completedCycles, 1)
})

test('disconnection retains inventories and reconnecting transfers the backlog', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(source, 'output', sink, 'input')
  updatePortInventory(source, 'outputs', 'output', 3)
  removeConnection(get(graph).connections[0].id)
  updatePortInventory(source, 'outputs', 'output', 4)
  assert.equal(readNode(sink).inventory.inputs.input, 3)
  assert.equal(readNode(source).inventory.outputs.output, 4)
  addConnection(source, 'output', sink, 'input')
  assert.equal(readNode(sink).inventory.inputs.input, 7)
})

test('node settings and inventory reject invalid values', () => {
  const source = createNode('source')
  updateNodeName(source, '  Mine  ')
  updateNodeName(source, ' ')
  assert.equal(readNode(source).name, 'Mine')
  updateNodeInterval(source, 2)
  updateNodeInterval(source, 0)
  updateNodeInterval(source, NaN)
  assert.equal(readNode(source).intervalMs, 2000)
  updatePortInventory(source, 'outputs', 'output', -1)
  updatePortInventory(source, 'outputs', 'output', 1.5)
  assert.equal(readNode(source).inventory.outputs.output, 0)
  advanceSimulation(1000)
  updateNodeInterval(source, 0.5)
  assert.equal(readNode(source).elapsedMs, 0)
  advanceSimulation(500)
  assert.equal(readNode(source).inventory.outputs.output, 1)
})

test('invalid, self, and duplicate connections are rejected', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(sink, 'output', source, 'input')
  addConnection(source, 'output', sink, 'missing')
  addConnection(source, 'output', source, 'input')
  addConnection('missing', 'output', sink, 'input')
  assert.equal(get(graph).connections.length, 0)
  addConnection(source, 'output', sink, 'input')
  addConnection(source, 'output', sink, 'input')
  assert.equal(get(graph).connections.length, 1)
})

test('input trends publish only completed three-second periods', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 10)
  advanceSimulation(999)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, null)
  advanceSimulation(1)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, null)
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'measuring')
  advanceSimulation(2000)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 10)
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'stable')
  updatePortInventory(process, 'inputs', 'inputA', 20)
  advanceSimulation(2999)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 10)
  assert.equal(readNode(process).inventoryTrends.inputA.previousNetChange, null)
  advanceSimulation(1)
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'increasing')
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 10)
  assert.equal(readNode(process).inventoryTrends.inputA.previousNetChange, 10)
})

test('net rate uses elapsed seconds rather than tick count', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 10)
  advanceSimulation(1000)
  updatePortInventory(process, 'inputs', 'inputA', 20)
  advanceSimulation(2000)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 20)
  assert.equal(readNode(process).inventoryTrends.inputA.rate, 20 / 3)
  updatePortInventory(process, 'inputs', 'inputA', 5)
  advanceSimulation(3000)
  const trend = readNode(process).inventoryTrends.inputA
  assert.equal(trend.previousRate, 20 / 3)
  assert.equal(trend.netChange, -15)
  assert.equal(trend.rate, -5)
  assert.equal(trend.direction, 'stable')
  advanceSimulation(3000)
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'stable')
})

test('input trends keep constant-size state for large inventories and long elapsed times', () => {
  const process = createNode('process')
  updatePortCapacity(process, 'inputs', 'inputA', 1_000_000_000_001)
  const originalKeys = Object.keys(readNode(process).inventoryTrends.inputA)
  updatePortInventory(process, 'inputs', 'inputA', 1_000_000_000_000)
  advanceSimulation(3000)
  updatePortInventory(process, 'inputs', 'inputA', 1_000_000_000_001)
  advanceSimulation(3000)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 1)
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'stable')
  advanceSimulation(5_000_000_000)
  const trend = readNode(process).inventoryTrends.inputA
  assert.equal(trend.direction, 'stable')
  assert.equal(trend.netChange, 0)
  assert.deepEqual(Object.keys(trend), originalKeys)
  assert.ok(Object.values(trend).every(value => value === null || typeof value !== 'object'))
})

test('trends are independent per input and do not mutate older graph snapshots', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 10)
  const previous = readNode(process)
  advanceSimulation(6000)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 10)
  assert.equal(readNode(process).inventoryTrends.inputB.netChange, 0)
  assert.equal(readNode(process).inventoryTrends.inputB.direction, 'stable')
  assert.equal(previous.inventoryTrends.inputA.netChange, null)
  const source = createNode('source')
  assert.deepEqual(Object.keys(readNode(source).inventoryTrends), ['output'])
})

test('input and output trends confirm meaningful net changes twice and ignore tiny changes', () => {
  for (const [direction, portId] of [['inputs', 'inputA'], ['outputs', 'output']]) {
    for (const [quantity, expected] of [
      [100, 'stable'], [101, 'stable'], [99, 'stable'], [114, 'increasing'], [86, 'decreasing'],
      [115, 'increasing'], [85, 'decreasing'], [116, 'increasing'], [84, 'decreasing']
    ]) {
      const process = createNode('process')
      updatePortCapacity(process, direction, portId, 200)
      updatePortInventory(process, direction, portId, 100)
      advanceSimulation(3000)
      advanceSimulation(3000)
      updatePortInventory(process, direction, portId, quantity)
      advanceSimulation(3000)
      assert.equal(readNode(process).inventoryTrends[portId].direction, 'stable')
      updatePortInventory(process, direction, portId, quantity + quantity - 100)
      advanceSimulation(3000)
      const trend = readNode(process).inventoryTrends[portId]
      assert.equal(trend.netChange, quantity - 100)
      assert.equal(trend.direction, expected, `${direction}: 100 to ${quantity}`)
    }
  }
})

test('output trends publish on three-second boundaries and handle zero baselines', () => {
  const source = createNode('source')
  updateNodeInterval(source, 86400)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'stable')
  updatePortInventory(source, 'outputs', 'output', 10)
  advanceSimulation(2999)
  assert.equal(readNode(source).inventoryTrends.output.netChange, 0)
  advanceSimulation(1)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'stable')
  assert.equal(readNode(source).inventoryTrends.output.previousNetChange, 0)
  updatePortInventory(source, 'outputs', 'output', 20)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'increasing')
  updatePortInventory(source, 'outputs', 'output', 10)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'increasing')
  updatePortInventory(source, 'outputs', 'output', 0)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'decreasing')
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'decreasing')
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'stable')
})

test('connected output inventories are stable when all production transfers immediately', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(source, 'output', sink, 'input')
  for (let tickIndex = 0; tickIndex < 100; tickIndex++) advanceSimulation(100)
  const trend = readNode(source).inventoryTrends.output
  assert.equal(trend.netChange, 0)
  assert.equal(trend.direction, 'stable')
  assert.ok(readNode(source).completedCycles > 0)
})

test('a blocked process keeps showing increasing while accumulating at a steady rate', () => {
  const source = createNode('source')
  const process = createNode('process')
  updatePortCapacity(process, 'inputs', 'inputA', 100)
  addConnection(source, 'output', process, 'inputA')
  for (let tickIndex = 0; tickIndex < 600; tickIndex++) advanceSimulation(100)
  const node = readNode(process)
  assert.equal(node.inventory.inputs.inputA, 60)
  assert.equal(node.inventory.inputs.inputB, 0)
  assert.equal(node.completedCycles, 0)
  assert.equal(node.inventoryTrends.inputA.direction, 'increasing')
  assert.equal(node.inventoryTrends.inputA.netChange, 3)
  assert.equal(node.inventoryTrends.inputA.rate, 1)
  assert.equal(node.inventoryTrends.inputA.previousRate, 1)
})

test('source and sink trends include production and consumption at the period boundary', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  updatePortInventory(sink, 'inputs', 'input', 10)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.netChange, 3)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'increasing')
  assert.equal(readNode(source).inventoryTrends.output.rate, 1)
  assert.equal(readNode(sink).inventoryTrends.input.netChange, -3)
  assert.equal(readNode(sink).inventoryTrends.input.rate, -1)
  advanceSimulation(3000)
  assert.equal(readNode(sink).inventoryTrends.input.direction, 'decreasing')
})

test('net trends account for connection backlog transfers and unchanged stock', () => {
  const source = createNode('source')
  const process = createNode('process')
  updateNodeInterval(source, 86400)
  updatePortInventory(source, 'outputs', 'output', 30)
  advanceSimulation(3000)
  addConnection(source, 'output', process, 'inputA')
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.netChange, -30)
  assert.equal(readNode(process).inventoryTrends.inputA.netChange, 30)
  advanceSimulation(3000)
  assert.equal(readNode(source).inventoryTrends.output.direction, 'stable')
  assert.equal(readNode(process).inventoryTrends.inputA.direction, 'stable')
})

test('delayed updates normalize net change by the actual measurement duration', () => {
  const source = createNode('source')
  advanceSimulation(10000)
  const trend = readNode(source).inventoryTrends.output
  assert.equal(trend.netChange, 10)
  assert.equal(trend.durationMs, 10000)
  assert.equal(trend.rate, 1)
  assert.equal(trend.direction, 'stable')
  assert.equal(trend.pendingPeriods, 1)
})

test('activity smoothing blends 25 percent new activity with 75 percent previous activity', () => {
  const process = createNode('process')
  updatePortCapacity(process, 'inputs', 'inputA', 400)
  updatePortInventory(process, 'inputs', 'inputA', 300)
  advanceSimulation(3000)
  assert.equal(readNode(process).inventoryTrends.inputA.smoothedActivityRate, 100)
  updatePortInventory(process, 'inputs', 'inputA', 360)
  advanceSimulation(3000)
  const trend = readNode(process).inventoryTrends.inputA
  assert.equal(trend.activityRate, 20)
  assert.equal(trend.smoothedActivityRate, 80)
  assert.equal(trend.threshold, 0.8)
})

test('millions of items moving with single-digit imbalance remain stable', () => {
  const process = createNode('process')
  updatePortCapacity(process, 'inputs', 'inputA', 4_000_000)
  const originalKeys = Object.keys(readNode(process).inventoryTrends.inputA)
  for (let periodIndex = 0; periodIndex < 4; periodIndex++) {
    const quantity = readNode(process).inventory.inputs.inputA
    updatePortInventory(process, 'inputs', 'inputA', quantity + 3_000_000)
    updatePortInventory(process, 'inputs', 'inputA', quantity + 3)
    advanceSimulation(3000)
  }
  const trend = readNode(process).inventoryTrends.inputA
  assert.equal(trend.netChange, 3)
  assert.equal(trend.rate, 1)
  assert.equal(trend.activityRate, 1_999_999)
  assert.equal(trend.threshold, 19_999.99)
  assert.equal(trend.direction, 'stable')
  assert.deepEqual(Object.keys(trend), originalKeys)
})

test('hysteresis retains a trend below entry threshold and confirms exits and reversals', () => {
  const process = createNode('process')
  function period(delta, durationMs = 3000) {
    updatePortInventory(process, 'inputs', 'inputA', readNode(process).inventory.inputs.inputA + delta)
    advanceSimulation(durationMs)
    return readNode(process).inventoryTrends.inputA
  }
  assert.equal(period(3).direction, 'stable')
  assert.equal(period(3).direction, 'increasing')
  assert.equal(period(1).direction, 'increasing')
  assert.equal(period(0).direction, 'increasing')
  assert.equal(period(1).direction, 'increasing')
  assert.equal(period(-3).direction, 'increasing')
  assert.equal(period(3).direction, 'increasing')
  assert.equal(period(-3).direction, 'increasing')
  assert.equal(period(-3).direction, 'decreasing')
  assert.equal(period(0).direction, 'decreasing')
  assert.equal(period(0).direction, 'stable')
})

test('routing counts gross output activity despite zero net inventory and preserves snapshots', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(source, 'output', sink, 'input')
  const previous = readNode(source)
  advanceSimulation(3000)
  const trend = readNode(source).inventoryTrends.output
  assert.equal(trend.netChange, 0)
  assert.equal(trend.activityRate, 2)
  assert.equal(trend.activityTotal, 0)
  assert.equal(previous.inventoryTrends.output.activityTotal, 0)
  assert.equal(previous.inventoryTrends.output.activityRate, null)
})

test('all ports default to capacity 30 and reject invalid or destructive edits', () => {
  const source = createNode('source')
  const process = createNode('process')
  const sink = createNode('sink')
  assert.deepEqual(readNode(source).capacity, { inputs: {}, outputs: { output: 30 } })
  assert.deepEqual(readNode(process).capacity, { inputs: { inputA: 30, inputB: 30 }, outputs: { output: 30 } })
  assert.deepEqual(readNode(sink).capacity, { inputs: { input: 30 }, outputs: {} })
  updatePortInventory(source, 'outputs', 'output', 31)
  assert.equal(readNode(source).inventory.outputs.output, 0)
  updatePortInventory(source, 'outputs', 'output', 20)
  for (const capacity of [19, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    updatePortCapacity(source, 'outputs', 'output', capacity)
    assert.equal(readNode(source).capacity.outputs.output, 30)
  }
  updatePortCapacity(source, 'outputs', 'output', 20)
  assert.equal(readNode(source).capacity.outputs.output, 20)
})

test('full outputs pause production without banking time and resume after space is freed', () => {
  const source = createNode('source')
  advanceSimulation(100000)
  assert.equal(readNode(source).inventory.outputs.output, 30)
  assert.equal(readNode(source).completedCycles, 30)
  assert.equal(readNode(source).elapsedMs, 0)
  advanceSimulation(100000)
  updatePortInventory(source, 'outputs', 'output', 29)
  advanceSimulation(999)
  assert.equal(readNode(source).inventory.outputs.output, 29)
  advanceSimulation(1)
  assert.equal(readNode(source).inventory.outputs.output, 30)
})

test('process output capacity limits cycles atomically without consuming excess inputs', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 10)
  updatePortInventory(process, 'inputs', 'inputB', 10)
  updatePortInventory(process, 'outputs', 'output', 29)
  advanceSimulation(100000)
  assert.deepEqual(readNode(process).inventory, { inputs: { inputA: 9, inputB: 9 }, outputs: { output: 30 } })
  advanceSimulation(100000)
  assert.equal(readNode(process).inventory.inputs.inputA, 9)
  assert.equal(readNode(process).completedCycles, 1)
})

test('capped sharing skips full inputs, redistributes short shares, and retains overflow', () => {
  const source = createNode('source')
  const sinks = [createNode('sink'), createNode('sink'), createNode('sink')]
  updatePortCapacity(sinks[0], 'inputs', 'input', 2)
  updatePortCapacity(sinks[1], 'inputs', 'input', 5)
  updatePortCapacity(sinks[2], 'inputs', 'input', 10)
  for (const sink of sinks) addConnection(source, 'output', sink, 'input')
  updatePortInventory(source, 'outputs', 'output', 20)
  assert.deepEqual(sinks.map(id => readNode(id).inventory.inputs.input), [2, 5, 10])
  assert.equal(readNode(source).inventory.outputs.output, 3)
  updatePortCapacity(sinks[0], 'inputs', 'input', 5)
  assert.equal(readNode(sinks[0]).inventory.inputs.input, 5)
  assert.equal(readNode(source).inventory.outputs.output, 0)
})

test('1000 items across ten capped inputs use fair whole-batch allocation', () => {
  const source = createNode('source')
  updatePortCapacity(source, 'outputs', 'output', 1000)
  const sinks = Array.from({ length: 10 }, () => createNode('sink'))
  for (const [index, sink] of sinks.entries()) {
    updatePortCapacity(sink, 'inputs', 'input', index === 0 ? 20 : index === 1 ? 80 : 150)
    addConnection(source, 'output', sink, 'input')
  }
  updatePortInventory(source, 'outputs', 'output', 1000)
  assert.deepEqual(sinks.map(id => readNode(id).inventory.inputs.input), [20, 80, 113, 113, 113, 113, 112, 112, 112, 112])
  assert.equal(readNode(source).inventory.outputs.output, 0)
})

test('round robin distributes remainder fairly while skipping full destinations', () => {
  const source = createNode('source')
  const sinks = [createNode('sink'), createNode('sink'), createNode('sink')]
  updatePortCapacity(sinks[1], 'inputs', 'input', 0)
  for (const sink of sinks) addConnection(source, 'output', sink, 'input')
  for (let batchIndex = 0; batchIndex < 6; batchIndex++) updatePortInventory(source, 'outputs', 'output', 1)
  assert.deepEqual(sinks.map(id => readNode(id).inventory.inputs.input), [3, 0, 3])
})

test('shared input headroom is respected across multiple producers without losing items', () => {
  const first = createNode('source')
  const second = createNode('source')
  const sink = createNode('sink')
  updatePortInventory(first, 'outputs', 'output', 20)
  updatePortInventory(second, 'outputs', 'output', 20)
  addConnection(first, 'output', sink, 'input')
  addConnection(second, 'output', sink, 'input')
  assert.equal(readNode(sink).inventory.inputs.input, 30)
  assert.equal(readNode(first).inventory.outputs.output + readNode(second).inventory.outputs.output, 10)
  const activityBefore = readNode(second).inventoryTrends.output.activityTotal
  advanceSimulation(1)
  assert.equal(readNode(second).inventoryTrends.output.activityTotal, activityBefore)
  assert.equal(readNode(sink).inventory.inputs.input, 30)
})

test('blocked transfers resume automatically after downstream consumption', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  updatePortCapacity(sink, 'inputs', 'input', 2)
  updatePortInventory(sink, 'inputs', 'input', 2)
  updatePortInventory(source, 'outputs', 'output', 30)
  addConnection(source, 'output', sink, 'input')
  advanceSimulation(1000)
  assert.equal(readNode(sink).inventory.inputs.input, 2)
  assert.equal(readNode(source).inventory.outputs.output, 29)
})

test('large capped allocations conserve stock without per-item work', () => {
  const source = createNode('source')
  const first = createNode('sink')
  const second = createNode('sink')
  updatePortCapacity(source, 'outputs', 'output', 1_000_000_000_000)
  updatePortCapacity(first, 'inputs', 'input', 1)
  updatePortCapacity(second, 'inputs', 'input', 1_000_000_000_000)
  addConnection(source, 'output', first, 'input')
  addConnection(source, 'output', second, 'input')
  updatePortInventory(source, 'outputs', 'output', 1_000_000_000_000)
  assert.equal(readNode(first).inventory.inputs.input, 1)
  assert.equal(readNode(second).inventory.inputs.input, 999_999_999_999)
})

test('cached routing invalidates after connection removal and capacity edits preserve snapshots', () => {
  const source = createNode('source')
  const first = createNode('sink')
  const second = createNode('sink')
  for (const sink of [first, second]) {
    updatePortCapacity(sink, 'inputs', 'input', 1)
    addConnection(source, 'output', sink, 'input')
  }
  updatePortInventory(source, 'outputs', 'output', 10)
  const connection = get(graph).connections.find(candidate => candidate.to === first)
  removeConnection(connection.id)
  updatePortInventory(first, 'inputs', 'input', 0)
  assert.equal(readNode(first).inventory.inputs.input, 0)
  assert.equal(readNode(source).inventory.outputs.output, 8)
  const previous = readNode(second)
  updatePortCapacity(second, 'inputs', 'input', 4)
  assert.equal(readNode(second).inventory.inputs.input, 4)
  assert.equal(readNode(source).inventory.outputs.output, 5)
  assert.equal(previous.capacity.inputs.input, 1)
  assert.equal(previous.inventory.inputs.input, 1)
})

test('batch water-filling matches a small per-item reference across varied capacities', () => {
  for (let caseIndex = 0; caseIndex < 100; caseIndex++) {
    graph.set({ nodes: [], connections: [] })
    const source = createNode('source')
    updatePortCapacity(source, 'outputs', 'output', 40)
    const capacities = Array.from({ length: 5 }, (_, index) => (caseIndex * 7 + index * 3) % 11)
    const sinks = capacities.map(capacity => {
      const sink = createNode('sink')
      updatePortCapacity(sink, 'inputs', 'input', capacity)
      addConnection(source, 'output', sink, 'input')
      return sink
    })
    const quantity = caseIndex % 41
    const expected = capacities.map(() => 0)
    let remaining = quantity
    let cursor = 0
    while (remaining > 0 && expected.some((amount, index) => amount < capacities[index])) {
      if (expected[cursor] < capacities[cursor]) {
        expected[cursor]++
        remaining--
      }
      cursor = (cursor + 1) % capacities.length
    }
    updatePortInventory(source, 'outputs', 'output', quantity)
    assert.deepEqual(sinks.map(id => readNode(id).inventory.inputs.input), expected)
    assert.equal(readNode(source).inventory.outputs.output, remaining)
  }
})

test('utilization reports busy time and operational production every three seconds', () => {
  const source = createNode('source')
  advanceSimulation(2999)
  assert.equal(readNode(source).performance.report, null)
  advanceSimulation(1)
  const node = readNode(source)
  assert.deepEqual(node.performance.report, {
    durationMs: 3000, busyPercent: 100, starvedPercent: 0, blockedPercent: 0, waitPercent: 0, cycleRate: 1
  })
  assert.deepEqual(node.flows.output.report, { inflow: 0, consumption: 0, production: 1, outflow: 0 })
  assert.equal(node.performance.elapsedMs, 0)
  assert.equal(node.flows.output.produced, 0)
})

test('large updates split busy and output-blocked time at the capacity boundary', () => {
  const source = createNode('source')
  updatePortCapacity(source, 'outputs', 'output', 1)
  advanceSimulation(3000)
  const report = readNode(source).performance.report
  assert.equal(report.busyPercent, 100 / 3)
  assert.equal(report.blockedPercent, 200 / 3)
  assert.equal(report.starvedPercent, 0)
  assert.equal(report.waitPercent, 200 / 3)
  assert.equal(report.cycleRate, 1 / 3)
  advanceSimulation(3000)
  assert.equal(readNode(source).performance.report.blockedPercent, 100)
})

test('partial cycle progress is timed accurately before input starvation', () => {
  const sink = createNode('sink')
  updatePortInventory(sink, 'inputs', 'input', 1)
  advanceSimulation(500)
  assert.equal(readNode(sink).performance.busyMs, 500)
  advanceSimulation(2500)
  const node = readNode(sink)
  assert.equal(node.performance.report.busyPercent, 100 / 3)
  assert.equal(node.performance.report.starvedPercent, 200 / 3)
  assert.equal(node.performance.report.blockedPercent, 0)
  assert.equal(node.flows.input.report.inflow, 0)
  assert.equal(node.flows.input.report.consumption, 1 / 3)
})

test('process utilization checks output space and reports consumption separately for each input', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 2)
  updatePortInventory(process, 'inputs', 'inputB', 3)
  updatePortCapacity(process, 'outputs', 'output', 1)
  advanceSimulation(3000)
  const node = readNode(process)
  assert.equal(node.performance.report.busyPercent, 100 / 3)
  assert.equal(node.performance.report.blockedPercent, 200 / 3)
  assert.equal(node.flows.inputA.report.consumption, 1 / 3)
  assert.equal(node.flows.inputB.report.consumption, 1 / 3)
  assert.equal(node.flows.output.report.production, 1 / 3)
  assert.equal(node.flows.inputA.report.inflow, 0)
})

test('partial cycles longer than the reporting interval count as busy without inventing completed cycles', () => {
  const source = createNode('source')
  updateNodeInterval(source, 5)
  advanceSimulation(3000)
  assert.equal(readNode(source).performance.report.busyPercent, 100)
  assert.equal(readNode(source).performance.report.cycleRate, 0)
  advanceSimulation(3000)
  assert.equal(readNode(source).performance.report.busyPercent, 100)
  assert.equal(readNode(source).performance.report.cycleRate, 1 / 3)
  assert.equal(readNode(source).elapsedMs, 1000)
})

test('balanced inventory still reports actual inflow, consumption, production, and outflow', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(source, 'output', sink, 'input')
  for (let tickIndex = 0; tickIndex < 60; tickIndex++) advanceSimulation(100)
  const output = readNode(source).flows.output.report
  const input = readNode(sink).flows.input.report
  assert.equal(output.production, 1)
  assert.equal(output.outflow, 1)
  assert.equal(input.inflow, 1)
  assert.equal(input.consumption, 1)
  assert.equal(readNode(source).inventoryTrends.output.netChange, 0)
  assert.equal(readNode(sink).performance.report.busyPercent, 100)
})

test('manual edits are excluded from throughput while resulting transfers are counted', () => {
  const source = createNode('source')
  const process = createNode('process')
  updateNodeInterval(source, 86400)
  updatePortInventory(source, 'outputs', 'output', 12)
  updatePortInventory(process, 'inputs', 'inputA', 4)
  advanceSimulation(3000)
  assert.equal(readNode(source).flows.output.report.production, 0)
  assert.equal(readNode(process).flows.inputA.report.inflow, 0)
  addConnection(source, 'output', process, 'inputA')
  advanceSimulation(3000)
  assert.equal(readNode(source).flows.output.report.outflow, 4)
  assert.equal(readNode(process).flows.inputA.report.inflow, 4)
  assert.equal(readNode(process).performance.report.starvedPercent, 100)
})

test('performance counters preserve snapshots and delayed reports normalize by actual elapsed time', () => {
  const source = createNode('source')
  const previous = readNode(source)
  advanceSimulation(10000)
  const node = readNode(source)
  assert.equal(node.performance.report.durationMs, 10000)
  assert.equal(node.performance.report.busyPercent, 100)
  assert.equal(node.flows.output.report.production, 1)
  assert.equal(previous.performance.elapsedMs, 0)
  assert.equal(previous.performance.report, null)
  assert.equal(previous.flows.output.produced, 0)
  assert.equal(previous.flows.output.report, null)
  const performanceKeys = Object.keys(node.performance)
  const flowKeys = Object.keys(node.flows.output)
  for (let periodIndex = 0; periodIndex < 20; periodIndex++) advanceSimulation(3000)
  assert.deepEqual(Object.keys(readNode(source).performance), performanceKeys)
  assert.deepEqual(Object.keys(readNode(source).flows.output), flowKeys)
})

test('busy, starved, and blocked percentages partition all elapsed time with blocked precedence', () => {
  const process = createNode('process')
  advanceSimulation(1000)
  updatePortInventory(process, 'inputs', 'inputA', 1)
  updatePortInventory(process, 'inputs', 'inputB', 1)
  advanceSimulation(1000)
  updatePortCapacity(process, 'outputs', 'output', 1)
  advanceSimulation(1000)
  const report = readNode(process).performance.report
  assert.equal(report.busyPercent, 100 / 3)
  assert.equal(report.starvedPercent, 100 / 3)
  assert.equal(report.blockedPercent, 100 / 3)
  assert.ok(Math.abs(report.busyPercent + report.starvedPercent + report.blockedPercent - 100) < 1e-9)
})

test('trillion-item transfers report throughput with fixed-size batch counters', () => {
  const source = createNode('source')
  const process = createNode('process')
  updateNodeInterval(source, 86400)
  updatePortCapacity(source, 'outputs', 'output', 1_000_000_000_000)
  updatePortCapacity(process, 'inputs', 'inputA', 1_000_000_000_000)
  updatePortInventory(source, 'outputs', 'output', 1_000_000_000_000)
  addConnection(source, 'output', process, 'inputA')
  advanceSimulation(3000)
  assert.equal(readNode(source).flows.output.report.production, 0)
  assert.equal(readNode(source).flows.output.report.outflow, 1_000_000_000_000 / 3)
  assert.equal(readNode(process).flows.inputA.report.inflow, 1_000_000_000_000 / 3)
  assert.equal(readNode(process).performance.report.starvedPercent, 100)
  assert.equal(readNode(process).flows.inputB.report.inflow, 0)
})

test('blocked and empty nodes report complete waiting periods without operational flow', () => {
  const source = createNode('source')
  const sink = createNode('sink')
  updatePortCapacity(source, 'outputs', 'output', 0)
  advanceSimulation(3000)
  assert.equal(readNode(source).performance.report.blockedPercent, 100)
  assert.equal(readNode(sink).performance.report.starvedPercent, 100)
  assert.equal(readNode(source).performance.report.waitPercent, 100)
  assert.equal(readNode(sink).performance.report.waitPercent, 100)
  assert.equal(readNode(source).flows.output.report.production, 0)
  assert.equal(readNode(sink).flows.input.report.consumption, 0)
})

test('configured process ports initialize inventory, capacities, trends, and flow counters', () => {
  addNode('process', 0, 0, { inputCount: 3, outputCount: 2 })
  const node = get(graph).nodes[0]
  assert.deepEqual(Object.keys(node.inventory.inputs), ['inputA', 'inputB', 'input3'])
  assert.deepEqual(Object.keys(node.inventory.outputs), ['output', 'output2'])
  for (const direction of ['inputs', 'outputs']) {
    for (const port of node.ports[direction]) {
      assert.equal(node.inventory[direction][port.id], 0)
      assert.equal(node.capacity[direction][port.id], 30)
      assert.equal(node.inventoryTrends[port.id].direction, 'measuring')
      assert.equal(node.flows[port.id].report, null)
    }
  }
})

test('configured process consumes every input and produces on every output atomically', () => {
  addNode('process', 0, 0, { inputCount: 3, outputCount: 2 })
  const process = get(graph).nodes[0].id
  updatePortInventory(process, 'inputs', 'inputA', 3)
  updatePortInventory(process, 'inputs', 'inputB', 3)
  advanceSimulation(3000)
  assert.equal(readNode(process).completedCycles, 0)
  updatePortInventory(process, 'inputs', 'input3', 2)
  advanceSimulation(3000)
  assert.deepEqual(readNode(process).inventory, {
    inputs: { inputA: 1, inputB: 1, input3: 0 }, outputs: { output: 2, output2: 2 }
  })
  assert.equal(readNode(process).flows.output2.report.production, 2 / 3)
  assert.equal(readNode(process).flows.input3.report.consumption, 2 / 3)
  updatePortInventory(process, 'inputs', 'input3', 2)
  updatePortInventory(process, 'outputs', 'output2', 30)
  advanceSimulation(3000)
  assert.equal(readNode(process).completedCycles, 2)
  assert.equal(readNode(process).inventory.inputs.inputA, 1)
  assert.equal(readNode(process).performance.report.blockedPercent, 100)
})

test('connections support configured input and output ports and reject missing ports', () => {
  addNode('process', 0, 0, { inputCount: 3, outputCount: 2 })
  const process = get(graph).nodes[0].id
  const source = createNode('source')
  const sink = createNode('sink')
  addConnection(source, 'output', process, 'input3')
  addConnection(process, 'output2', sink, 'input')
  addConnection(source, 'output', process, 'input4')
  addConnection(process, 'output3', sink, 'input')
  assert.equal(get(graph).connections.length, 2)
  updatePortInventory(source, 'outputs', 'output', 5)
  updatePortInventory(process, 'outputs', 'output2', 7)
  assert.equal(readNode(process).inventory.inputs.input3, 5)
  assert.equal(readNode(sink).inventory.inputs.input, 7)
})

test('process port count validation and defaults preserve existing node behavior', () => {
  for (const count of [0, -1, 1.5, 33, NaN, Infinity, '2']) {
    addNode('process', 0, 0, { inputCount: count, outputCount: 1 })
    addNode('process', 0, 0, { inputCount: 1, outputCount: count })
  }
  assert.equal(get(graph).nodes.length, 0)
  const defaultProcess = createNode('process')
  assert.equal(readNode(defaultProcess).ports.inputs.length, 2)
  assert.equal(readNode(defaultProcess).ports.outputs.length, 1)
  addNode('process', 0, 0, { inputCount: 1, outputCount: 1 })
  const single = get(graph).nodes.at(-1).id
  updatePortInventory(single, 'inputs', 'inputA', 1)
  advanceSimulation(1000)
  assert.equal(readNode(single).inventory.outputs.output, 1)
})

test('process ratios consume and produce exact per-port quantities in whole cycles', () => {
  addNode('process', 0, 0, { inputCount: 2, outputCount: 2 })
  const process = get(graph).nodes[0].id
  updateRecipeQuantity(process, 'inputs', 'inputA', 2)
  updateRecipeQuantity(process, 'inputs', 'inputB', 3)
  updateRecipeQuantity(process, 'outputs', 'output', 4)
  updateRecipeQuantity(process, 'outputs', 'output2', 5)
  updatePortInventory(process, 'inputs', 'inputA', 5)
  updatePortInventory(process, 'inputs', 'inputB', 8)
  advanceSimulation(3000)
  const node = readNode(process)
  assert.deepEqual(node.inventory, { inputs: { inputA: 1, inputB: 2 }, outputs: { output: 8, output2: 10 } })
  assert.equal(node.completedCycles, 2)
  assert.equal(node.flows.inputA.report.consumption, 4 / 3)
  assert.equal(node.flows.inputB.report.consumption, 2)
  assert.equal(node.flows.output.report.production, 8 / 3)
  assert.equal(node.flows.output2.report.production, 10 / 3)
  assert.equal(node.performance.report.busyPercent, 200 / 3)
  assert.equal(node.performance.report.starvedPercent, 100 / 3)
})

test('ratios wait for complete inputs and complete output headroom before consuming anything', () => {
  const process = createNode('process')
  updateRecipeQuantity(process, 'inputs', 'inputA', 3)
  updateRecipeQuantity(process, 'outputs', 'output', 4)
  updatePortInventory(process, 'inputs', 'inputA', 2)
  updatePortInventory(process, 'inputs', 'inputB', 2)
  advanceSimulation(3000)
  assert.equal(readNode(process).completedCycles, 0)
  assert.equal(readNode(process).performance.report.starvedPercent, 100)
  updatePortInventory(process, 'inputs', 'inputA', 6)
  updatePortInventory(process, 'outputs', 'output', 27)
  advanceSimulation(3000)
  assert.equal(readNode(process).inventory.inputs.inputA, 6)
  assert.equal(readNode(process).performance.report.blockedPercent, 100)
  updatePortInventory(process, 'outputs', 'output', 26)
  advanceSimulation(3000)
  assert.deepEqual(readNode(process).inventory, { inputs: { inputA: 3, inputB: 1 }, outputs: { output: 30 } })
  assert.equal(readNode(process).completedCycles, 1)
})

test('recipe edits validate positive integers, preserve stock and snapshots, and reset cycle progress', () => {
  const process = createNode('process')
  updatePortInventory(process, 'inputs', 'inputA', 10)
  updatePortInventory(process, 'inputs', 'inputB', 10)
  advanceSimulation(500)
  const previous = readNode(process)
  for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    updateRecipeQuantity(process, 'inputs', 'inputA', quantity)
  }
  assert.equal(readNode(process).recipe.inputs.inputA, 1)
  assert.equal(readNode(process).elapsedMs, 500)
  updateRecipeQuantity(process, 'inputs', 'missing', 2)
  updateRecipeQuantity(process, 'unknown', 'inputA', 2)
  updateRecipeQuantity(process, 'inputs', 'inputA', 3)
  assert.equal(readNode(process).elapsedMs, 0)
  assert.equal(readNode(process).inventory.inputs.inputA, 10)
  assert.equal(previous.recipe.inputs.inputA, 1)
  assert.equal(previous.elapsedMs, 500)
  const source = createNode('source')
  updateRecipeQuantity(source, 'outputs', 'output', 4)
  assert.equal(readNode(source).recipe.outputs.output, 4)
})

test('supply-limited cycle rate divides each input inflow by its recipe requirement', () => {
  const process = createNode('process')
  const first = createNode('source')
  const second = createNode('source')
  updateNodeInterval(first, 86400)
  updateNodeInterval(second, 86400)
  updateRecipeQuantity(process, 'inputs', 'inputA', 2)
  updateRecipeQuantity(process, 'inputs', 'inputB', 3)
  assert.equal(getSupplyLimitedCycleRate(readNode(process)), null)
  addConnection(first, 'output', process, 'inputA')
  addConnection(second, 'output', process, 'inputB')
  updatePortInventory(first, 'outputs', 'output', 6)
  updatePortInventory(second, 'outputs', 'output', 3)
  advanceSimulation(3000)
  assert.equal(getSupplyLimitedCycleRate(readNode(process)), 1 / 3)
  assert.equal(getSupplyLimitedCycleRate(readNode(first)), null)
})

test('output ratios larger than capacity block safely and resume after capacity increases', () => {
  addNode('process', 0, 0, { inputCount: 1, outputCount: 1 })
  const process = get(graph).nodes[0].id
  updateRecipeQuantity(process, 'outputs', 'output', 1_000_000)
  updatePortInventory(process, 'inputs', 'inputA', 2)
  advanceSimulation(3000)
  assert.equal(readNode(process).completedCycles, 0)
  assert.equal(readNode(process).inventory.inputs.inputA, 2)
  assert.equal(readNode(process).performance.report.blockedPercent, 100)
  updatePortCapacity(process, 'outputs', 'output', 2_000_000)
  advanceSimulation(3000)
  assert.equal(readNode(process).inventory.outputs.output, 2_000_000)
  assert.equal(readNode(process).inventory.inputs.inputA, 0)
})

test('one output lacking recipe headroom blocks every output without partial consumption', () => {
  addNode('process', 0, 0, { inputCount: 1, outputCount: 2 })
  const process = get(graph).nodes[0].id
  updateRecipeQuantity(process, 'inputs', 'inputA', 2)
  updateRecipeQuantity(process, 'outputs', 'output', 4)
  updateRecipeQuantity(process, 'outputs', 'output2', 5)
  updatePortInventory(process, 'inputs', 'inputA', 10)
  updatePortInventory(process, 'outputs', 'output2', 26)
  advanceSimulation(3000)
  assert.equal(readNode(process).completedCycles, 0)
  assert.equal(readNode(process).inventory.inputs.inputA, 10)
  assert.equal(readNode(process).inventory.outputs.output, 0)
  assert.equal(readNode(process).performance.report.blockedPercent, 100)
  updatePortInventory(process, 'outputs', 'output2', 25)
  advanceSimulation(3000)
  assert.deepEqual(readNode(process).inventory, { inputs: { inputA: 8 }, outputs: { output: 4, output2: 30 } })
})

test('source and sink support configured port counts with default capacities and recipes', () => {
  addNode('source', 0, 0, { outputCount: 3 })
  addNode('sink', 0, 0, { inputCount: 3 })
  const [source, sink] = get(graph).nodes
  assert.deepEqual(source.inventory, { inputs: {}, outputs: { output: 0, output2: 0, output3: 0 } })
  assert.deepEqual(sink.inventory, { inputs: { input: 0, input2: 0, input3: 0 }, outputs: {} })
  for (const node of [source, sink]) {
    for (const direction of ['inputs', 'outputs']) {
      for (const port of node.ports[direction]) {
        assert.equal(node.capacity[direction][port.id], 30)
        assert.equal(node.recipe[direction][port.id], 1)
        assert.equal(node.flows[port.id].report, null)
        assert.equal(node.inventoryTrends[port.id].direction, 'measuring')
      }
    }
  }
})

test('multi-output sources produce configured ratios atomically with per-port flow metrics', () => {
  addNode('source', 0, 0, { outputCount: 2 })
  const source = get(graph).nodes[0].id
  updateRecipeQuantity(source, 'outputs', 'output', 2)
  updateRecipeQuantity(source, 'outputs', 'output2', 5)
  advanceSimulation(3000)
  assert.deepEqual(readNode(source).inventory.outputs, { output: 6, output2: 15 })
  assert.equal(readNode(source).flows.output.report.production, 2)
  assert.equal(readNode(source).flows.output2.report.production, 5)
  updatePortInventory(source, 'outputs', 'output2', 26)
  advanceSimulation(3000)
  assert.deepEqual(readNode(source).inventory.outputs, { output: 6, output2: 26 })
  assert.equal(readNode(source).performance.report.blockedPercent, 100)
  updatePortCapacity(source, 'outputs', 'output2', 31)
  advanceSimulation(1000)
  assert.deepEqual(readNode(source).inventory.outputs, { output: 8, output2: 31 })
})

test('multi-input sinks consume configured ratios only when all inputs have complete batches', () => {
  addNode('sink', 0, 0, { inputCount: 2 })
  const sink = get(graph).nodes[0].id
  updateRecipeQuantity(sink, 'inputs', 'input', 2)
  updateRecipeQuantity(sink, 'inputs', 'input2', 3)
  updatePortInventory(sink, 'inputs', 'input', 10)
  updatePortInventory(sink, 'inputs', 'input2', 2)
  advanceSimulation(3000)
  assert.equal(readNode(sink).completedCycles, 0)
  assert.equal(readNode(sink).inventory.inputs.input, 10)
  assert.equal(readNode(sink).performance.report.starvedPercent, 100)
  updatePortInventory(sink, 'inputs', 'input2', 7)
  advanceSimulation(3000)
  assert.deepEqual(readNode(sink).inventory.inputs, { input: 6, input2: 1 })
  assert.equal(readNode(sink).completedCycles, 2)
  assert.equal(readNode(sink).flows.input.report.consumption, 4 / 3)
  assert.equal(readNode(sink).flows.input2.report.consumption, 2)
})

test('configured source outputs and sink inputs connect, route, and validate independently', () => {
  addNode('source', 0, 0, { outputCount: 2 })
  addNode('sink', 0, 0, { inputCount: 2 })
  const [source, sink] = get(graph).nodes
  addConnection(source.id, 'output2', sink.id, 'input2')
  addConnection(source.id, 'output3', sink.id, 'input2')
  addConnection(source.id, 'output', sink.id, 'input3')
  assert.equal(get(graph).connections.length, 1)
  updatePortInventory(source.id, 'outputs', 'output2', 7)
  assert.equal(readNode(sink.id).inventory.inputs.input2, 7)
  assert.equal(readNode(sink.id).inventory.inputs.input, 0)
})

test('source and sink counts reject invalid values and keep single-port defaults', () => {
  for (const count of [0, -1, 1.5, 33, NaN, Infinity, '2']) {
    addNode('source', 0, 0, { outputCount: count })
    addNode('sink', 0, 0, { inputCount: count })
  }
  assert.equal(get(graph).nodes.length, 0)
  const source = createNode('source')
  const sink = createNode('sink')
  assert.equal(readNode(source).ports.outputs.length, 1)
  assert.equal(readNode(sink).ports.inputs.length, 1)
  for (const id of [source, sink]) {
    const direction = id === source ? 'outputs' : 'inputs'
    const portId = id === source ? 'output' : 'input'
    const previous = readNode(id)
    for (const amount of [0, -1, 1.5, NaN]) updateRecipeQuantity(id, direction, portId, amount)
    assert.equal(readNode(id).recipe[direction][portId], 1)
    updateRecipeQuantity(id, direction, portId, 4)
    assert.equal(readNode(id).recipe[direction][portId], 4)
    assert.equal(previous.recipe[direction][portId], 1)
  }
})

test('multi-port source and sink recipes maintain matched operational flow end to end', () => {
  addNode('source', 0, 0, { outputCount: 2 })
  addNode('sink', 0, 0, { inputCount: 2 })
  const [source, sink] = get(graph).nodes
  updateRecipeQuantity(source.id, 'outputs', 'output', 2)
  updateRecipeQuantity(source.id, 'outputs', 'output2', 3)
  updateRecipeQuantity(sink.id, 'inputs', 'input', 2)
  updateRecipeQuantity(sink.id, 'inputs', 'input2', 3)
  addConnection(source.id, 'output', sink.id, 'input')
  addConnection(source.id, 'output2', sink.id, 'input2')
  for (let tickIndex = 0; tickIndex < 60; tickIndex++) advanceSimulation(100)
  assert.equal(readNode(source.id).flows.output.report.production, 2)
  assert.equal(readNode(source.id).flows.output2.report.outflow, 3)
  assert.equal(readNode(sink.id).flows.input.report.inflow, 2)
  assert.equal(readNode(sink.id).flows.input2.report.consumption, 3)
  assert.equal(readNode(source.id).performance.report.busyPercent, 100)
  assert.equal(readNode(sink.id).performance.report.busyPercent, 100)
})