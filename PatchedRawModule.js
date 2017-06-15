"use strict";

const RawModule = require("webpack/lib/RawModule");

class PatchedRawModule extends RawModule {
  // RawModule has a regression in webpack-2 where it does not include its own
  // source in the module hash.
  // See https://github.com/webpack/webpack/issues/5070
  updateHash(hash) {
    hash.update(this.sourceStr);
    super.updateHash(hash);
  }
}

module.exports = PatchedRawModule;
