"use strict";

const DevelopmentModePlugin = require("./DevelopmentModePlugin");
const ProductionModePlugin = require("./ProductionModePlugin");

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
class GlobalizePlugin {
  constructor(attributes) {
    this.attributes = attributes || {};
  }

  apply(compiler) {
    const CurrentModePlugin = this.attributes.production ? ProductionModePlugin : DevelopmentModePlugin;
    const plugin = new CurrentModePlugin(this.attributes);

    if (compiler.hooks) {
      plugin.apply(compiler);
    } else {
      compiler.apply(plugin);
    }
  }
}

module.exports = GlobalizePlugin;
