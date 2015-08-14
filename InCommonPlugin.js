var fs = require("fs");
var path = require("path");
var SkipAMDPlugin = require("skip-amd-webpack-plugin");

function InCommon() {
  this.tmpdir = path.resolve("./.tmp-globalize-webpack");

  if (!fs.existsSync(this.tmpdir)) {
    fs.mkdirSync(this.tmpdir);
  } else {
    if (!fs.statSync(this.tmpdir).isDirectory()) {
      throw new Error("Unable to create temporary directory: `" + this.tmpdir + "`");
    }
  }
}

InCommon.prototype.apply = function(compiler) {
  // Skip AMD part of Globalize Runtime UMD wrapper.
  compiler.apply(new SkipAMDPlugin(/(^|\/)globalize($|\/)/));
};

module.exports = InCommon;
