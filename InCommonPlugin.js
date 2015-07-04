var SkipAMDOfUMDPlugin = require("skip-amd-webpack-plugin");

function InCommon() {}

InCommon.prototype.apply = function(compiler) {
  // Skip AMD part of Globalize Runtime UMD wrapper.
  compiler.apply(new SkipAMDOfUMDPlugin(/(^|\/)globalize($|\/)/));
};

module.exports = InCommon;
