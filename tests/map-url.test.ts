import assert from "node:assert/strict";
import { test } from "node:test";
import { addressMapUrl, pickupMapUrl } from "../src/lib/map-url";

test("missing and unsafe pickup maps never become links", () => {
  for (const value of [null, undefined, "", "  ", "#", "/school", "javascript:alert(1)", "data:text/html,hi", "http://example.com/map", "https://user:pass@example.com/map"]) {
    assert.equal(pickupMapUrl(value), null);
  }
  assert.equal(pickupMapUrl(" https://example.com/map.png "), "https://example.com/map.png");
});

test("address map safely encodes the full address", () => {
  const address = "550 East Olive Ave, Sunnyvale, CA 94086 & 小树苗";
  const url = new URL(addressMapUrl(address));
  assert.equal(url.protocol, "https:");
  assert.equal(url.searchParams.get("q"), address);
  assert.equal(url.searchParams.get("output"), "embed");
});
