var PrerenderModePlugin = require("./PrerenderModePlugin");
var ProductionModePlugin = require("./ProductionModePlugin");
var DevelopmentModePlugin = require("./DevelopmentModePlugin");

/**
 * Development Mode:
 * - Automatically loads CLDR data (i.e., injects `Globalize.load(<necessary CLDR data>)`).
 * - Automatically define default locale (i.e., injects `Globalize.locale(<defaultLocale>)`).
 *
 * Production Mode:
 * - Have Globalize modules replaced with their runtime modules.
 * - Statically extracts formatters and parsers from user code and pre-compile
 *   them into respective XXXX.
 */
function GlobalizePlugin(attributes) {
  this.attributes = attributes || {};
}

GlobalizePlugin.prototype.apply = function(compiler) {
  compiler.apply(
    this.attributes.production ?
      (compiler.options.target === "node" ? 
        new PrerenderModePlugin(this.attributes) : 
        new ProductionModePlugin(this.attributes) ) :
      new DevelopmentModePlugin(this.attributes)
  );
};

module.exports = GlobalizePlugin;
