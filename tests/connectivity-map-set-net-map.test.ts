import { expect, test } from "bun:test"
import { ConnectivityMap } from "../src/ConnectivityMap"

test("replacing nets on the same map clears stale memberships", () => {
  const connMap = new ConnectivityMap({ old_net: ["old_port", "vm_port"] })

  connMap.setNetMap({
    vm: ["vm_port", "vm_trace"],
    gnd: ["gnd_port"],
  })

  expect(connMap.getNetConnectedToId("old_port")).toBeUndefined()
  expect(connMap.getIdsConnectedToNet("old_net")).toEqual([])
  expect(connMap.areIdsConnected("vm_port", "vm_trace")).toBe(true)
  expect(connMap.areIdsConnected("vm_port", "gnd_port")).toBe(false)

  connMap.addConnections([["vm_trace", "vm_pad"]])
  expect(connMap.areIdsConnected("vm_port", "vm_pad")).toBe(true)
})
