var cldrData = require("cldr-data");
var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var fs = require("fs");
var InCommonPlugin = require("./InCommonPlugin");
var path = require("path");
var util = require("./util");

var mainFiles = ["ca-gregorian", "currencies", "dateFields", "numbers", "timeZoneNames"];

/**
 * Development Mode:
 * - Automatically loads CLDR data (i.e., injects `Globalize.load(<necessary CLDR data>)`).
 * - Automatically define default locale (i.e., injects `Globalize.locale(<defaultLocale>)`).
 */
function DevelopmentModePlugin(attributes) {
  var cldr, i18nDataTemplate, messages;

  InCommonPlugin.apply(this, arguments);

  cldr = attributes.cldr || cldrData.entireSupplemental().concat(mainFiles.map(function(mainFile) {
    return cldrData(path.join("main", attributes.developmentLocale, mainFile));
  }));
  messages = attributes.messages && util.readMessages(attributes.messages, attributes.developmentLocale);

  i18nDataTemplate = [
    "var Globalize = require(\"globalize\");",
    "",
    "Globalize.load(" + JSON.stringify(cldr) + ");",
    messages ?  "Globalize.loadMessages(" + JSON.stringify(messages) + ");": "",
    "Globalize.locale(" + JSON.stringify(attributes.developmentLocale) + ");",
    "",
    "module.exports = Globalize;"
  ].join("\n");

  this.i18nData = path.join(this.tmpdir, "dev-i18n-data.js");
  fs.writeFileSync(this.i18nData, i18nDataTemplate);
}

DevelopmentModePlugin.prototype.apply = function(compiler) {
  var i18nData = this.i18nData;

  compiler.apply(new InCommonPlugin());

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom generated template, which in turn requires
  // Globalize, loads CLDR, set the default locale and then exports the
  // Globalize object.
  compiler.parser.plugin("call require:commonjs:item", function(expr, param) {
    if(param.isString() && param.string === "globalize" &&
          !util.isGlobalizeModule(this.state.current.request) &&
          !(new RegExp(i18nData)).test(this.state.current.request)) {
      var dep;

      dep = new CommonJsRequireDependency(i18nData, param.range);
      dep.loc = expr.loc;
      dep.optional = !!this.scope.inTry;
      this.state.current.addDependency(dep);

      return true;
    }
  });
};

module.exports = DevelopmentModePlugin;
