import type { AnyCircuitElement, PcbTraceRoutePoint } from "circuit-json"
import { ConnectivityMap } from "./ConnectivityMap"

function addPcbConnection({
  connection,
  connMap,
  sourceConnectivityNetIds,
}: {
  connection: string[]
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
  if (sourceNetIds.size > 1) return

  const [sourceNetId] = sourceNetIds
  // Keep the source net canonical when attaching previously unowned PCB IDs.
  if (sourceNetId) {
    connMap.addConnections([
      [connMap.getIdsConnectedToNet(sourceNetId)[0], ...connection],
    ])
  } else {
    connMap.addConnections([connection])
  }
}

/** Maps PCB objects to intended source nets without letting PCB references merge them. */
export const getFullConnectivityMapFromCircuitJson = (
  circuitJson: AnyCircuitElement[],
) => {
  const sourceConnections: string[][] = []
  const pcbConnections: string[][] = []
  const pcbEndpointConnections: string[][] = []

  for (const element of circuitJson) {
    if (element.type === "source_trace") {
      sourceConnections.push(
        [
          element.source_trace_id,
          ...(element.connected_source_port_ids ?? []),
          ...(element.connected_source_net_ids ?? []),
        ].filter(Boolean),
      )
    } else if (element.type === "source_port") {
      sourceConnections.push([element.source_port_id])
    } else if (element.type === "source_net") {
      sourceConnections.push([element.source_net_id])
    } else if (element.type === "pcb_port") {
      const { pcb_port_id, source_port_id } = element
      if (source_port_id && pcb_port_id) {
        pcbConnections.push([source_port_id, pcb_port_id])
      }
    } else if (element.type === "pcb_smtpad") {
      const { pcb_smtpad_id, pcb_port_id } = element
      if (pcb_port_id && pcb_smtpad_id) {
        pcbConnections.push([pcb_smtpad_id, pcb_port_id])
      }
    } else if (element.type === "pcb_plated_hole") {
      const { pcb_plated_hole_id, pcb_port_id } = element
      if (pcb_port_id && pcb_plated_hole_id) {
        pcbConnections.push([pcb_plated_hole_id, pcb_port_id])
      }
    } else if (element.type === "pcb_trace") {
      const { pcb_trace_id, source_trace_id } = element
      const route = Array.isArray(element.route)
        ? element.route.filter(
            (rp: PcbTraceRoutePoint) => rp && rp.route_type === "wire",
          )
        : []
      if (source_trace_id && pcb_trace_id) {
        pcbConnections.push([pcb_trace_id, source_trace_id])
      }
      if (Array.isArray(route)) {
        const endpointIds = route.flatMap((rp) =>
          [rp.start_pcb_port_id, rp.end_pcb_port_id].filter(
            (id): id is string => Boolean(id),
          ),
        )
        pcbEndpointConnections.push([pcb_trace_id, ...endpointIds])
      }
    } else if (element.type === "pcb_via") {
      const { pcb_via_id, pcb_trace_id, source_trace_id, source_net_id } =
        element
      const connectedIds = [
        pcb_trace_id,
        source_trace_id,
        source_net_id,
      ].filter((connectedId): connectedId is string => Boolean(connectedId))
      if (pcb_via_id && connectedIds.length > 0) {
        pcbConnections.push([pcb_via_id, ...connectedIds])
      }
      if (element.pcb_port_ids?.length) {
        pcbEndpointConnections.push([pcb_via_id, ...element.pcb_port_ids])
      }
    } else if (element.type === "source_component") {
      if (element.internally_connected_source_port_ids) {
        for (const portGroup of element.internally_connected_source_port_ids) {
          sourceConnections.push(portGroup)
        }
      }
    } else if (element.type === "source_component_internal_connection") {
      sourceConnections.push(element.source_port_ids)
    }
  }

  const connMap = new ConnectivityMap({})
  connMap.addConnections(sourceConnections)
  const sourceConnectivityNetIds = new Set(Object.values(connMap.idToNetMap))

  for (const connection of pcbConnections) {
    addPcbConnection({ connection, connMap, sourceConnectivityNetIds })
  }

  for (const [pcbId, ...endpointIds] of pcbEndpointConnections) {
    const pcbNetId = connMap.getNetConnectedToId(pcbId)
    if (pcbNetId && sourceConnectivityNetIds.has(pcbNetId)) {
      // An explicit source owner wins over a contradictory saved endpoint.
      for (const endpointId of endpointIds) {
        addPcbConnection({
          connection: [pcbId, endpointId],
          connMap,
          sourceConnectivityNetIds,
        })
      }
    } else {
      // Infer an unowned fragment only when its endpoints agree on one source net.
      addPcbConnection({
        connection: [pcbId, ...endpointIds],
        connMap,
        sourceConnectivityNetIds,
      })
    }
  }

  return connMap
}
