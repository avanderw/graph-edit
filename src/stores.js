import { writable } from 'svelte/store'

const inputPorts = {
  source: [],
  process: [{ id: 'inputA', label: 'Input A' }, { id: 'inputB', label: 'Input B' }],
  sink: [{ id: 'input', label: 'Input' }]
}

export const inventoryTrendPeriodMs = 3000
const activitySmoothing = 0.25
const defaultPortCapacity = 30
let indexedConnections = null
let connectionsByOutput = new Map()

export function getInputPorts(type) {
  if (typeof type === 'object') return type.ports?.inputs || getInputPorts(type.type)
  return inputPorts[type] || []
}

export function getOutputPorts(type) {
  if (typeof type === 'object') return type.ports?.outputs || getOutputPorts(type.type)
  return type === 'source' || type === 'process' ? [{ id: 'output', label: 'Output' }] : []
}

export function getRecipeQuantity(node, direction, portId) {
  return node.recipe?.[direction]?.[portId] ?? 1
}

export function getSupplyLimitedCycleRate(node) {
  const ports = getInputPorts(node)
  if (node.type !== 'process' || !ports.every(port => node.flows[port.id].report)) return null
  return Math.min(1000 / node.intervalMs, ...ports.map(port =>
    node.flows[port.id].report.inflow / getRecipeQuantity(node, 'inputs', port.id)
  ))
}

function createInventoryTrend() {
  return {
    elapsedMs: 0,
    baseline: 0,
    netChange: null,
    rate: null,
    previousNetChange: null,
    previousRate: null,
    durationMs: 0,
    activityTotal: 0,
    activityRate: null,
    smoothedActivityRate: null,
    threshold: 0.5,
    pendingDirection: null,
    pendingPeriods: 0,
    direction: 'measuring'
  }
}

function advanceInventoryTrend(previous, quantity, deltaMs) {
  const trend = { ...previous, elapsedMs: previous.elapsedMs + deltaMs }
  if (trend.elapsedMs < inventoryTrendPeriodMs) return trend

  trend.previousNetChange = trend.netChange
  trend.previousRate = trend.rate
  trend.netChange = quantity - trend.baseline
  trend.durationMs = trend.elapsedMs
  trend.rate = trend.netChange / (trend.durationMs / 1000)
  trend.activityRate = trend.activityTotal / (trend.durationMs / 1000)
  trend.smoothedActivityRate = trend.smoothedActivityRate === null ? trend.activityRate :
    activitySmoothing * trend.activityRate + (1 - activitySmoothing) * trend.smoothedActivityRate
  trend.threshold = Math.max(0.5, 0.01 * trend.smoothedActivityRate)
  if (trend.direction === 'measuring') trend.direction = 'stable'

  let candidate = 'stable'
  if (trend.rate >= trend.threshold) candidate = 'increasing'
  else if (trend.rate <= -trend.threshold) candidate = 'decreasing'
  else if (trend.direction === 'increasing' && trend.rate > trend.threshold / 2) candidate = 'increasing'
  else if (trend.direction === 'decreasing' && trend.rate < -trend.threshold / 2) candidate = 'decreasing'

  if (candidate === trend.direction) {
    trend.pendingDirection = null
    trend.pendingPeriods = 0
  } else {
    trend.pendingPeriods = trend.pendingDirection === candidate ? trend.pendingPeriods + 1 : 1
    trend.pendingDirection = candidate
    if (trend.pendingPeriods >= 2) {
      trend.direction = candidate
      trend.pendingDirection = null
      trend.pendingPeriods = 0
    }
  }
  trend.baseline = quantity
  trend.elapsedMs = 0
  trend.activityTotal = 0
  return trend
}

function createPortFlow() {
  return { received: 0, consumed: 0, produced: 0, transferred: 0, report: null }
}

function accountNodeTime(node, deltaMs, busyMs, waitState, cycles) {
  node.performance.elapsedMs += deltaMs
  node.performance.busyMs += busyMs
  node.performance[`${waitState}Ms`] += Math.max(0, deltaMs - busyMs)
  node.performance.cycles += cycles
}

function publishPerformance(node) {
  const metrics = node.performance
  if (metrics.elapsedMs < inventoryTrendPeriodMs) return
  const seconds = metrics.elapsedMs / 1000
  metrics.report = {
    durationMs: metrics.elapsedMs,
    busyPercent: 100 * metrics.busyMs / metrics.elapsedMs,
    starvedPercent: 100 * metrics.starvedMs / metrics.elapsedMs,
    blockedPercent: 100 * metrics.blockedMs / metrics.elapsedMs,
    waitPercent: 100 * (metrics.starvedMs + metrics.blockedMs) / metrics.elapsedMs,
    cycleRate: metrics.cycles / seconds
  }
  metrics.elapsedMs = 0
  metrics.busyMs = 0
  metrics.starvedMs = 0
  metrics.blockedMs = 0
  metrics.cycles = 0
  for (const flow of Object.values(node.flows)) {
    flow.report = {
      inflow: flow.received / seconds,
      consumption: flow.consumed / seconds,
      production: flow.produced / seconds,
      outflow: flow.transferred / seconds
    }
    flow.received = 0
    flow.consumed = 0
    flow.produced = 0
    flow.transferred = 0
  }
}

function changeInventory(node, direction, portId, delta, reason = 'manual') {
  node.inventory[direction][portId] += delta
  node.inventoryTrends[portId].activityTotal += Math.abs(delta)
  const flow = node.flows[portId]
  if (reason === 'transfer') {
    if (direction === 'inputs') flow.received += delta
    else flow.transferred -= delta
  } else if (reason === 'production') flow.produced += delta
  else if (reason === 'consumption') flow.consumed -= delta
}

function copySimulationState(state) {
  return {
    ...state,
    nodes: state.nodes.map(node => ({
      ...node,
      inventory: { inputs: { ...node.inventory.inputs }, outputs: { ...node.inventory.outputs } },
      capacity: { inputs: { ...node.capacity.inputs }, outputs: { ...node.capacity.outputs } },
      inventoryTrends: Object.fromEntries(Object.entries(node.inventoryTrends).map(([portId, trend]) => [portId, { ...trend }])),
      performance: { ...node.performance },
      flows: Object.fromEntries(Object.entries(node.flows).map(([portId, flow]) => [portId, { ...flow }])),
      roundRobin: { ...node.roundRobin }
    }))
  }
}

function getConnectionsByOutput(connections) {
  if (indexedConnections === connections) return connectionsByOutput
  indexedConnections = connections
  connectionsByOutput = new Map()
  for (const connection of connections) {
    if (!connectionsByOutput.has(connection.from)) connectionsByOutput.set(connection.from, new Map())
    const outputs = connectionsByOutput.get(connection.from)
    if (!outputs.has(connection.fromOutput)) outputs.set(connection.fromOutput, [])
    outputs.get(connection.fromOutput).push(connection)
  }
  return connectionsByOutput
}

function transferInventory(state) {
  const nodesById = new Map(state.nodes.map(node => [node.id, node]))
  const adjacency = getConnectionsByOutput(state.connections)
  for (const node of state.nodes) {
    for (const port of getOutputPorts(node)) {
      const quantity = node.inventory.outputs[port.id]
      const targets = adjacency.get(node.id)?.get(port.id) || []
      if (!quantity || !targets.length) continue

      const start = (node.roundRobin[port.id] || 0) % targets.length
      const allocations = targets.map((connection, index) => {
        const target = nodesById.get(connection.to)
        const headroom = target ? Math.max(0, target.capacity.inputs[connection.toInput] - target.inventory.inputs[connection.toInput]) : 0
        return { connection, index, target, headroom, amount: 0 }
      })
      const eligible = allocations.filter(allocation => allocation.headroom > 0)
        .sort((first, second) => first.headroom - second.headroom)
      let remaining = quantity
      let eligibleIndex = 0
      while (eligibleIndex < eligible.length) {
        const count = eligible.length - eligibleIndex
        const share = Math.floor(remaining / count)
        const allocation = eligible[eligibleIndex]
        if (allocation.headroom > share) {
          for (let shareIndex = eligibleIndex; shareIndex < eligible.length; shareIndex++) {
            eligible[shareIndex].amount = share
          }
          remaining -= share * count
          break
        }
        allocation.amount = allocation.headroom
        remaining -= allocation.amount
        eligibleIndex++
      }

      if (eligibleIndex < eligible.length) {
        for (let offset = 0; offset < targets.length && remaining > 0; offset++) {
          const allocation = allocations[(start + offset) % targets.length]
          if (allocation.amount >= allocation.headroom) continue
          allocation.amount++
          remaining--
          node.roundRobin[port.id] = (allocation.index + 1) % targets.length
        }
      }
      for (const allocation of allocations) {
        if (!allocation.amount) continue
        changeInventory(allocation.target, 'inputs', allocation.connection.toInput, allocation.amount, 'transfer')
      }
      changeInventory(node, 'outputs', port.id, -(quantity - remaining), 'transfer')
    }
  }
  return state
}

// Graph state: nodes and connections
export const graph = writable({
  nodes: [],
  connections: []
})

// UI state for dragging/selection
export const ui = writable({
  selectedNodeId: null,
  draggingNodeId: null,
  draggingConnection: null, // { fromNodeId, fromOutput, mouseX, mouseY }
  panX: 0,
  panY: 0,
  zoom: 1
})

// Add a new node to the graph
export function addNode(type, x, y, options = {}) {
  if (!Object.hasOwn(inputPorts, type)) return
  const inputCount = type === 'source' ? 0 : options.inputCount ?? (type === 'process' ? 2 : 1)
  const outputCount = type === 'sink' ? 0 : options.outputCount ?? 1
  const counts = type === 'source' ? [outputCount] : type === 'sink' ? [inputCount] : [inputCount, outputCount]
  if (counts.some(count => !Number.isInteger(count) || count < 1 || count > 32)) return
  const ports = {
    inputs: Array.from({ length: inputCount }, (_, index) => ({
      id: type === 'sink' ? index === 0 ? 'input' : `input${index + 1}` : index === 0 ? 'inputA' : index === 1 ? 'inputB' : `input${index + 1}`,
      label: type === 'sink' && inputCount === 1 ? 'Input' : `Input ${index + 1}`
    })),
    outputs: Array.from({ length: outputCount }, (_, index) => ({
      id: index === 0 ? 'output' : `output${index + 1}`,
      label: outputCount === 1 ? 'Output' : `Output ${index + 1}`
    }))
  }
  graph.update(g => {
    const node = {
      id: `node-${crypto.randomUUID()}`,
      type,
      ports,
      name: type[0].toUpperCase() + type.slice(1),
      x,
      y,
      width: 380,
      height: 400,
      intervalMs: 1000,
      elapsedMs: 0,
      completedCycles: 0,
      inventory: {
        inputs: Object.fromEntries(ports.inputs.map(port => [port.id, 0])),
        outputs: Object.fromEntries(ports.outputs.map(port => [port.id, 0]))
      },
      capacity: {
        inputs: Object.fromEntries(ports.inputs.map(port => [port.id, defaultPortCapacity])),
        outputs: Object.fromEntries(ports.outputs.map(port => [port.id, defaultPortCapacity]))
      },
      recipe: {
        inputs: Object.fromEntries(ports.inputs.map(port => [port.id, 1])),
        outputs: Object.fromEntries(ports.outputs.map(port => [port.id, 1]))
      },
      inventoryTrends: Object.fromEntries([...ports.inputs, ...ports.outputs].map(port => [port.id, createInventoryTrend()])),
      performance: { elapsedMs: 0, busyMs: 0, starvedMs: 0, blockedMs: 0, cycles: 0, report: null },
      flows: Object.fromEntries([...ports.inputs, ...ports.outputs].map(port => [port.id, createPortFlow()])),
      roundRobin: {},
      data: {}
    }
    return { ...g, nodes: [...g.nodes, node] }
  })
}

export function updateNodeName(id, name) {
  const trimmedName = name.trim().slice(0, 80)
  if (!trimmedName) return
  graph.update(state => ({
    ...state,
    nodes: state.nodes.map(node => node.id === id ? { ...node, name: trimmedName } : node)
  }))
}

export function updateNodeInterval(id, seconds) {
  const intervalMs = Math.round(Number(seconds) * 1000)
  if (!Number.isFinite(intervalMs) || intervalMs < 100 || intervalMs > 86400000) return
  graph.update(state => ({
    ...state,
    nodes: state.nodes.map(node => node.id === id ? { ...node, intervalMs, elapsedMs: 0 } : node)
  }))
}

export function updatePortInventory(id, direction, portId, quantity) {
  const amount = Number(quantity)
  if (!Number.isSafeInteger(amount) || amount < 0) return
  graph.update(state => {
    const next = copySimulationState(state)
    const node = next.nodes.find(candidate => candidate.id === id)
    if (!node || !Object.hasOwn(node.inventory[direction] || {}, portId)) return state
    if (amount > node.capacity[direction][portId]) return state
    changeInventory(node, direction, portId, amount - node.inventory[direction][portId])
    return transferInventory(next)
  })
}

export function updatePortCapacity(id, direction, portId, quantity) {
  const capacity = Number(quantity)
  if (!Number.isSafeInteger(capacity) || capacity < 0) return
  graph.update(state => {
    const node = state.nodes.find(candidate => candidate.id === id)
    if (!node || !Object.hasOwn(node.capacity[direction] || {}, portId) ||
      capacity < node.inventory[direction][portId]) return state
    const next = copySimulationState(state)
    next.nodes.find(candidate => candidate.id === id).capacity[direction][portId] = capacity
    return transferInventory(next)
  })
}

export function updateRecipeQuantity(id, direction, portId, quantity) {
  const amount = Number(quantity)
  if (!Number.isSafeInteger(amount) || amount < 1) return
  graph.update(state => ({
    ...state,
    nodes: state.nodes.map(node => {
      if (node.id !== id || !Object.hasOwn(node.recipe[direction] || {}, portId)) return node
      return {
        ...node,
        elapsedMs: 0,
        recipe: { ...node.recipe, [direction]: { ...node.recipe[direction], [portId]: amount } }
      }
    })
  }))
}

export function advanceSimulation(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return
  graph.update(state => {
    if (!state.nodes.length) return state
    const next = transferInventory(copySimulationState(state))
    for (const node of next.nodes) {
      const inputs = Object.entries(node.inventory.inputs).map(([portId, quantity]) =>
        Math.floor(quantity / getRecipeQuantity(node, 'inputs', portId))
      )
      const outputHeadroom = Object.entries(node.inventory.outputs).map(([portId, quantity]) =>
        Math.floor((node.capacity.outputs[portId] - quantity) / getRecipeQuantity(node, 'outputs', portId))
      )
      const availableCycles = Math.min(...inputs, ...outputHeadroom)
      if (availableCycles === 0) {
        accountNodeTime(node, deltaMs, 0, outputHeadroom.some(space => space === 0) ? 'blocked' : 'starved', 0)
        node.elapsedMs = 0
        continue
      }

      const elapsedMs = node.elapsedMs + deltaMs
      const cycles = Math.min(Math.floor(elapsedMs / node.intervalMs), availableCycles)
      const busyMs = cycles === availableCycles ? Math.min(deltaMs, Math.max(0, cycles * node.intervalMs - node.elapsedMs)) : deltaMs
      node.elapsedMs = cycles === availableCycles ? 0 : elapsedMs % node.intervalMs
      node.completedCycles += cycles
      for (const port of getInputPorts(node)) changeInventory(node, 'inputs', port.id, -cycles * getRecipeQuantity(node, 'inputs', port.id), 'consumption')
      for (const port of getOutputPorts(node)) changeInventory(node, 'outputs', port.id, cycles * getRecipeQuantity(node, 'outputs', port.id), 'production')
      const blocked = Object.entries(node.inventory.outputs).some(([portId, quantity]) =>
        node.capacity.outputs[portId] - quantity < getRecipeQuantity(node, 'outputs', portId)
      )
      accountNodeTime(node, deltaMs, busyMs, blocked ? 'blocked' : 'starved', cycles)
    }
    transferInventory(next)
    for (const node of next.nodes) {
      node.inventoryTrends = Object.fromEntries(Object.values(node.inventory).flatMap(ports =>
        Object.entries(ports).map(([portId, quantity]) => [
          portId,
          advanceInventoryTrend(node.inventoryTrends[portId], quantity, deltaMs)
        ])
      ))
      publishPerformance(node)
    }
    return next
  })
}

// Update node position
export function updateNodePosition(id, x, y) {
  graph.update(g => ({
    ...g,
    nodes: g.nodes.map(n => n.id === id ? { ...n, x, y } : n)
  }))
}

// Delete a node
export function deleteNode(id) {
  graph.update(g => ({
    nodes: g.nodes.filter(n => n.id !== id),
    connections: g.connections.filter(c => c.from !== id && c.to !== id)
  }))
}

// Add a connection between nodes
export function addConnection(fromNodeId, fromOutput, toNodeId, toInput) {
  graph.update(g => {
    const fromNode = g.nodes.find(node => node.id === fromNodeId)
    const toNode = g.nodes.find(node => node.id === toNodeId)
    if (!fromNode || !toNode || fromNodeId === toNodeId ||
      !getOutputPorts(fromNode).some(port => port.id === fromOutput) ||
      !getInputPorts(toNode).some(port => port.id === toInput)) return g

    // Prevent duplicate connections
    const exists = g.connections.some(c =>
      c.from === fromNodeId && c.fromOutput === fromOutput &&
      c.to === toNodeId && c.toInput === toInput
    )
    if (exists) return g

    return transferInventory({
      ...copySimulationState(g),
      connections: [...g.connections, {
        id: `conn-${crypto.randomUUID()}`,
        from: fromNodeId,
        fromOutput,
        to: toNodeId,
        toInput
      }]
    })
  })
}

// Remove a connection
export function removeConnection(connectionId) {
  graph.update(g => ({
    ...g,
    connections: g.connections.filter(c => c.id !== connectionId)
  }))
}

// Set selected node
export function selectNode(id) {
  ui.update(u => ({ ...u, selectedNodeId: id }))
}

// Set dragging node
export function setDraggingNode(id) {
  ui.update(u => ({ ...u, draggingNodeId: id }))
}

// Start dragging a connection from an output port
export function startConnectionDrag(fromNodeId, fromOutput, fromX, fromY) {
  const canvasRect = document.querySelector('.canvas').getBoundingClientRect()
  ui.update(u => {
    // Convert screen coordinates to canvas-relative coordinates
    const canvasFromX = (fromX - canvasRect.left - u.panX) / u.zoom
    const canvasFromY = (fromY - canvasRect.top - u.panY) / u.zoom

    return {
      ...u,
      draggingConnection: {
        fromNodeId,
        fromOutput,
        fromX: canvasFromX,
        fromY: canvasFromY,
        toX: canvasFromX,
        toY: canvasFromY
      }
    }
  })
}

// Update the preview line while dragging
export function updateConnectionDragPreview(toX, toY) {
  const canvasRect = document.querySelector('.canvas').getBoundingClientRect()
  ui.update(u => {
    if (!u.draggingConnection) return u

    // Convert screen coordinates to canvas-relative coordinates
    const canvasToX = (toX - canvasRect.left - u.panX) / u.zoom
    const canvasToY = (toY - canvasRect.top - u.panY) / u.zoom

    return {
      ...u,
      draggingConnection: {
        ...u.draggingConnection,
        toX: canvasToX,
        toY: canvasToY
      }
    }
  })
}

// Set dragging connection (legacy, kept for compatibility)
export function setDraggingConnection(draggingConnection) {
  ui.update(u => ({ ...u, draggingConnection }))
}

// Update pan
export function updatePan(panX, panY) {
  ui.update(u => ({ ...u, panX, panY }))
}

// Update zoom
export function setZoom(zoom) {
  ui.update(u => ({ ...u, zoom }))
}
