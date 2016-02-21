var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var fs = require("fs");
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
  var tmpdir = util.tmpdir();

  this.messagesPath = path.resolve(attributes.messages.replace("[locale]", attributes.developmentLocale));
  i18nDataTemplate = [
    "var messages = require(\"" + this.messagesPath + "\");",
    "var Globalize = require(\"globalize\");",
    "",
    "Globalize.load(" + JSON.stringify(cldr(attributes.developmentLocale)) + ");",
    this.messagesPath ?  "Globalize.loadMessages(messages);" : "",
    "Globalize.locale(" + JSON.stringify(attributes.developmentLocale) + ");",
    "",
    "if (module.hot) {",
    "  Globalize.loadMessages(messages);",
    "  module.hot.accept();",
    "}",
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
  compiler.apply(new SkipAMDPlugin(/(^|\/)globalize($|\/)/));

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom generated template, which in turn requires
  // Globalize, loads CLDR, set the default locale and then exports the
  // Globalize object.
  compiler.parser.plugin("call require:commonjs:item", function(expr, param) {
    var request = this.state.current.request;
    if(param.isString() && param.string === "globalize" && moduleFilter(request) &&
          !(new RegExp(i18nData)).test(request)) {
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
