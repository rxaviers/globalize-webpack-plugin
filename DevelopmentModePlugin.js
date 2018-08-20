"use strict";

const CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
const fs = require("fs");
const path = require("path");
const SkipAMDPlugin = require("skip-amd-webpack-plugin");
const util = require("./util");

/**
 * Development Mode:
 * - Automatically loads CLDR data (i.e., injects `Globalize.load(<necessary CLDR data>)`).
 * - Automatically define default locale (i.e., injects `Globalize.locale(<defaultLocale>)`).
 */
class DevelopmentModePlugin {
  constructor(attributes) {
    let i18nDataTemplate, messages;
    const cldr = attributes.cldr || util.cldr;
    const timeZoneData = attributes.timeZoneData || util.timeZoneData;
    const tmpdirBase = attributes.tmpdirBase || ".";
    const tmpdir = util.tmpdir(tmpdirBase);

    messages = attributes.messages && util.readMessages(attributes.messages, attributes.developmentLocale);

    i18nDataTemplate = [
      "var Globalize = require(\"globalize\");",
      "",
      `Globalize.load(${JSON.stringify(cldr(attributes.developmentLocale))});`,
      messages ? `Globalize.loadMessages(${JSON.stringify(messages)});` : "",
      `Globalize.loadTimeZone(${JSON.stringify(timeZoneData())});`,
      `Globalize.locale(${JSON.stringify(attributes.developmentLocale)});`,
      "",
      "module.exports = Globalize;"
    ].join("\n");

    this.i18nData = path.join(tmpdir, "dev-i18n-data.js");
    this.moduleFilter = util.moduleFilterFn(attributes.moduleFilter);
    fs.writeFileSync(this.i18nData, i18nDataTemplate);
  }

  apply(compiler) {
    // Skip AMD part of Globalize Runtime UMD wrapper.
    const skipAMDPlugin = new SkipAMDPlugin(/(^|[\/\\])globalize($|[\/\\])/);
    if (compiler.hooks) {
      skipAMDPlugin.apply(compiler);
    } else {
      compiler.apply(skipAMDPlugin);
    }


    // "Intercepts" all `require("globalize")` by transforming them into a
    // `require` to our custom generated template, which in turn requires
    // Globalize, loads CLDR, set the default locale and then exports the
    // Globalize object.
    const interceptRequireGlobalize = (parser) => {
      const requireHook = (expr, param) => {
        const request = parser.state.current.request;

        if(param.isString() && param.string === "globalize" && this.moduleFilter(request) &&
          !(new RegExp(util.escapeRegex(this.i18nData))).test(request)) {

          const dep = new CommonJsRequireDependency(this.i18nData, param.range);
          dep.loc = expr.loc;
          dep.optional = !!parser.scope.inTry;
          parser.state.current.addDependency(dep);

          return true;
        }
      };

      if (parser.hooks) {
        parser.hooks.call
          .for("require")
          .tap("GlobalizePlugin", (expr) => {
            if (expr.arguments.length !== 1) return;
            const param = parser.evaluateExpression(expr.arguments[0]);
            requireHook(expr, param);
          });
      } else {
        parser.plugin("call require:commonjs:item", requireHook);
      }
    };

    if (compiler.hooks) {
      compiler.hooks.normalModuleFactory.tap("GlobalizePlugin", factory => {
        factory.hooks.parser.for("javascript/auto").tap("GlobalizePlugin", interceptRequireGlobalize);
      });
    } else {
      compiler.plugin("compilation", (compilation, params) => {
        params.normalModuleFactory.plugin("parser", interceptRequireGlobalize);
      });
    }
  }
}

module.exports = DevelopmentModePlugin;
