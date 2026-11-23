import { expect, test } from "bun:test"
import "bun-match-svg"
import type { AnyCircuitElement, PcbNoteText } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  getFullConnectivityMapFromCircuitJson,
  getSourcePortConnectivityMapFromCircuitJson,
} from "../src"
import fixture from "./fixtures/nema8-tvs-sample/circuit.json"

test("the NEMA8 TVS sample keeps intended VM and GND nets separate", async () => {
  const circuitJson = fixture as AnyCircuitElement[]
  const sourceConnectivity =
    getSourcePortConnectivityMapFromCircuitJson(circuitJson)
  expect(
    sourceConnectivity.areIdsConnected("source_port_155", "source_port_150"),
  ).toBe(false)

  const fullConnectivity = getFullConnectivityMapFromCircuitJson(circuitJson)
  const vmConnectedToGnd = fullConnectivity.areIdsConnected(
    "source_port_155",
    "source_port_150",
  )
  expect(vmConnectedToGnd).toBe(false)
  expect(
    fullConnectivity.areIdsConnected("source_trace_8", "pcb_port_150"),
  ).toBe(false)

  const resultNote: PcbNoteText = {
    type: "pcb_note_text",
    pcb_note_text_id: "map_result",
    anchor_position: { x: 1.2, y: 0.45 },
    anchor_alignment: "center",
    layer: "top",
    font: "tscircuit2024",
    font_size: 0.32,
    color: "#0f172a",
    text: "Full map connects VM to GND: " + vmConnectedToGnd,
  }
  await expect(
    convertCircuitJsonToPcbSvg([...circuitJson, resultNote], {
      width: 1000,
      height: 660,
      backgroundColor: "#fff",
      includeVersion: false,
      showPinNumbers: true,
      shouldDrawRatsNest: false,
      viewport: { minX: -4.2, maxX: 7, minY: 0, maxY: 7.4 },
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
