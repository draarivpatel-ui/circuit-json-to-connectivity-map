import type { AnyCircuitElement, PcbTraceRoutePoint } from "circuit-json"
import { ConnectivityMap } from "./ConnectivityMap"
import { findConnectedNetworks } from "./findConnectedNetworks"

type Connection = string[]

function addPcbConnection({
  connection,
  connMap,
  sourceConnectivityNetIds,
}: {
  connection: Connection
  connMap: ConnectivityMap
  sourceConnectivityNetIds: Set<string>
}) {
  const sourceNetIds = new Set(
    connection
      .map((id) => connMap.getNetConnectedToId(id))
      .filter(
        (netId) => netId !== undefined && sourceConnectivityNetIds.has(netId),
      ),
  )
  if (sourceNetIds.size > 1) return false

  const [sourceNetId] = sourceNetIds
  if (sourceNetId) {
    connMap.addConnections([
      [connMap.getIdsConnectedToNet(sourceNetId)[0], ...connection],
    ])
  } else {
    connMap.addConnections([connection])
  }
  return true
}

/** Maps PCB objects to intended source nets without letting PCB references merge them. */
export const getFullConnectivityMapFromCircuitJson = (
  circuitJson: AnyCircuitElement[],
) => {
  const connections: Connection[] = []
  const sourceConnections: Connection[] = []
  const pcbConnections: Connection[] = []
  const viaConnections: Connection[] = []
  const traceEndpointConnections: {
    pcbTraceId: string
    connections: Connection[]
  }[] = []

  for (const element of circuitJson) {
    if (element.type === "source_trace") {
      const connection = [
        element.source_trace_id,
        ...(element.connected_source_port_ids ?? []),
        ...(element.connected_source_net_ids ?? []),
      ].filter(Boolean)
      sourceConnections.push(connection)
      connections.push(connection)
    } else if (element.type === "source_port") {
      sourceConnections.push([element.source_port_id])
    } else if (element.type === "source_net") {
      sourceConnections.push([element.source_net_id])
    } else if (element.type === "source_manually_placed_via") {
      const sourcePortIds = circuitJson.flatMap((sourcePort) =>
        sourcePort.type === "source_port" &&
        sourcePort.source_component_id === element.source_manually_placed_via_id
          ? [sourcePort.source_port_id]
          : [],
      )
      sourceConnections.push(
        [
          ...sourcePortIds,
          element.source_net_id,
          element.source_trace_id,
        ].filter((id): id is string => Boolean(id)),
      )
    } else if (element.type === "pcb_port") {
      const { pcb_port_id, source_port_id } = element
      if (source_port_id && pcb_port_id) {
        const connection = [source_port_id, pcb_port_id]
        pcbConnections.push(connection)
        connections.push(connection)
      }
    } else if (element.type === "pcb_smtpad") {
      const { pcb_smtpad_id, pcb_port_id } = element
      if (pcb_port_id && pcb_smtpad_id) {
        const connection = [pcb_smtpad_id, pcb_port_id]
        pcbConnections.push(connection)
        connections.push(connection)
      }
    } else if (element.type === "pcb_plated_hole") {
      const { pcb_plated_hole_id, pcb_port_id } = element
      if (pcb_port_id && pcb_plated_hole_id) {
        const connection = [pcb_plated_hole_id, pcb_port_id]
        pcbConnections.push(connection)
        connections.push(connection)
      }
    } else if (element.type === "pcb_trace") {
      const { pcb_trace_id, source_trace_id } = element
      if (source_trace_id && pcb_trace_id) {
        const connection = [pcb_trace_id, source_trace_id]
        pcbConnections.push(connection)
        connections.push(connection)
      }
      const route = Array.isArray(element.route)
        ? element.route.filter(
            (rp: PcbTraceRoutePoint) => rp && rp.route_type === "wire",
          )
        : []
      const endpointConnections: Connection[] = []
      for (const point of route) {
        if (point.start_pcb_port_id) {
          endpointConnections.push([point.start_pcb_port_id, pcb_trace_id])
        }
        if (point.end_pcb_port_id) {
          endpointConnections.push([pcb_trace_id, point.end_pcb_port_id])
        }
      }
      traceEndpointConnections.push({
        pcbTraceId: pcb_trace_id,
        connections: endpointConnections,
      })
      connections.push(...endpointConnections)
    } else if (element.type === "pcb_via") {
      const { pcb_via_id, pcb_trace_id, source_trace_id, source_net_id } =
        element
      const connectedIds = [
        ...(element.pcb_port_ids ?? []),
        pcb_trace_id,
        source_trace_id,
        source_net_id,
      ].filter((id): id is string => Boolean(id))
      if (pcb_via_id && connectedIds.length > 0) {
        const connection = [pcb_via_id, ...connectedIds]
        viaConnections.push(connection)
        connections.push(connection)
      }
    } else if (element.type === "source_component") {
      for (const portGroup of element.internally_connected_source_port_ids ??
        []) {
        sourceConnections.push(portGroup)
        connections.push(portGroup)
      }
    } else if (element.type === "source_component_internal_connection") {
      sourceConnections.push(element.source_port_ids)
    }
  }

  const connMap = new ConnectivityMap({})
  connMap.addConnections(sourceConnections)
  const sourceConnectivityNetIds = new Set(Object.values(connMap.idToNetMap))
  const allowedConnections = new Set(sourceConnections)

  for (const connection of [...pcbConnections, ...viaConnections]) {
    if (addPcbConnection({ connection, connMap, sourceConnectivityNetIds })) {
      allowedConnections.add(connection)
    }
  }

  for (const trace of traceEndpointConnections) {
    const traceNetId = connMap.getNetConnectedToId(trace.pcbTraceId)
    if (traceNetId && sourceConnectivityNetIds.has(traceNetId)) {
      // An explicit source owner wins over a contradictory saved endpoint.
      for (const connection of trace.connections) {
        if (
          addPcbConnection({ connection, connMap, sourceConnectivityNetIds })
        ) {
          allowedConnections.add(connection)
        }
      }
    } else if (
      addPcbConnection({
        connection: [trace.pcbTraceId, ...trace.connections.flat()],
        connMap,
        sourceConnectivityNetIds,
      })
    ) {
      // An unowned fragment can inherit only one intended source net.
      for (const connection of trace.connections) {
        allowedConnections.add(connection)
      }
    }
  }

  // Retain legacy network IDs and ordering for existing routing consumers.
  // Extra source-only identities are appended so they do not renumber PCB groups.
  connMap.netMap = findConnectedNetworks(
    [...connections, ...sourceConnections].filter((connection) =>
      allowedConnections.has(connection),
    ),
  )
  connMap.idToNetMap = {}
  for (const [netId, ids] of Object.entries(connMap.netMap)) {
    for (const id of ids) connMap.idToNetMap[id] = netId
  }
  return connMap
}
