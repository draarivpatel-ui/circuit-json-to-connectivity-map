import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "../src"

test("source connectivity keys retain intended ownership when source traces are filtered", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "source_net",
      source_net_id: "gnd",
      name: "GND",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: "board_gnd",
    },
    {
      type: "source_port",
      source_port_id: "ground_pin",
      source_component_id: "testpoint",
      name: "GND",
      subcircuit_connectivity_map_key: "board_gnd",
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_ground_pin",
      source_port_id: "ground_pin",
      x: 0,
      y: 0,
      layers: ["top"],
    },
  ]

  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson)
  expect(connMap.areIdsConnected("gnd", "ground_pin")).toBe(true)
  expect(connMap.areIdsConnected("gnd", "pcb_ground_pin")).toBe(true)
})
