"use strict";

const crypto = require("crypto");
const expect = require("chai").expect;
const PatchedRawModule = require("../PatchedRawModule");

const hashModule = (module) => {
  const hash = crypto.createHash("sha256");
  module.updateHash(hash);
  return hash.digest("hex");
};

describe("PatchedRawModule", () => {
  describe("updateHash", () => {
    it("should produce the same hash for modules with the same source", () => {
      const a = new PatchedRawModule("foo");
      const b = new PatchedRawModule("foo");
      expect(hashModule(a)).to.equal(hashModule(b));
    });

    it("should produce different hashes for modules with different source", () => {
      const a = new PatchedRawModule("foo");
      const b = new PatchedRawModule("bar");
      expect(hashModule(a)).to.not.equal(hashModule(b));
    });
  });
});
