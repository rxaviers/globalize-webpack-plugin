var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var fs = require("fs");
var NormalModuleFactory = require("webpack/lib/NormalModuleFactory");
var path = require("path");
var SkipAMDPlugin = require("skip-amd-webpack-plugin");
var util = require("./util");

/**
 * Development Mode:
 * - Automatically loads CLDR data (i.e., injects `Globalize.load(<necessary CLDR data>)`).
 * - Automatically define default locale (i.e., injects `Globalize.locale(<defaultLocale>)`).
 */
function DevelopmentModePlugin(attributes) {
  var i18nDataTemplate, messages;
  var cldr = attributes.cldr || util.cldr;
  var ianaTzData = attributes.ianaTzData || util.ianaTzData;
  var tmpdir = util.tmpdir();

  messages = attributes.messages && util.readMessages(attributes.messages, attributes.developmentLocale);

  i18nDataTemplate = [
    "var Globalize = require(\"globalize\");",
    "",
    "Globalize.load(" + JSON.stringify(cldr(attributes.developmentLocale)) + ");",
    messages ?  "Globalize.loadMessages(" + JSON.stringify(messages) + ");": "",
    "Globalize.loadIANATimeZone(" + JSON.stringify(ianaTzData()) + ");",
    "Globalize.locale(" + JSON.stringify(attributes.developmentLocale) + ");",
    "",
    "module.exports = Globalize;"
  ].join("\n");

  this.i18nData = path.join(tmpdir, "dev-i18n-data.js");
  this.moduleFilter = util.moduleFilterFn(attributes.moduleFilter);
  fs.writeFileSync(this.i18nData, i18nDataTemplate);
}

DevelopmentModePlugin.prototype.apply = function(compiler) {
  var i18nData = this.i18nData;
  var moduleFilter = this.moduleFilter;

  // Skip AMD part of Globalize Runtime UMD wrapper.
  compiler.apply(new SkipAMDPlugin(/(^|[\/\\])globalize($|[\/\\])/));

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom generated template, which in turn requires
  // Globalize, loads CLDR, set the default locale and then exports the
  // Globalize object.
  var bindParser = function(parser) {
    parser.plugin("call require:commonjs:item", function(expr, param) {
      var request = this.state.current.request;

      if(param.isString() && param.string === "globalize" && moduleFilter(request) &&
        !(new RegExp(util.escapeRegex(i18nData))).test(request)) {
        var dep;

        dep = new CommonJsRequireDependency(i18nData, param.range);
        dep.loc = expr.loc;
        dep.optional = !!this.scope.inTry;
        this.state.current.addDependency(dep);

        return true;
      }
    });
  };

  // Hack to support webpack 1.x and 2.x.
  // webpack 2.x
  if (NormalModuleFactory.prototype.createParser) {
    compiler.plugin("compilation", function(compilation, params) {
      params.normalModuleFactory.plugin("parser", bindParser);
    });

  // webpack 1.x
  } else {
    bindParser(compiler.parser);
  }
};

module.exports = DevelopmentModePlugin;
