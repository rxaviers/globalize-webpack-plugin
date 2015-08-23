var fs = require("fs");
var globalizeCompiler = require("globalize-compiler");
var path = require("path");

function GlobalizeCompilerHelper(attributes) {
  this.asts = {};
  this.extracts = [];
  this.extractsMap = {};
  this.modules = {};

  this.cldr = attributes.cldr;
  this.developmentLocale = attributes.developmentLocale;
  this.messages = attributes.messages;
  this.tmpdir = attributes.tmpdir;
  this.webpackCompiler = attributes.webpackCompiler;
}

GlobalizeCompilerHelper.prototype.setAst = function(request, ast) {
  this.asts[request] = ast;
};

GlobalizeCompilerHelper.prototype.getExtract = function(request) {
  var ast, extract;
  if(!this.extractsMap[request]) {
    ast = this.asts[request];
    extract = globalizeCompiler.extract(ast);
    this.extractsMap[request] = extract;
    this.extracts.push(extract);
  }
  return this.extractsMap[request];
};

GlobalizeCompilerHelper.prototype.createCompiledDataModule = function(request) {
  var filepath = this.getModuleFilepath(request);
  this.modules[filepath] = true;

  fs.writeFileSync(filepath, this.compile(this.developmentLocale, request));

  return filepath;
};

GlobalizeCompilerHelper.prototype.getModuleFilepath = function(request) {
  return path.join(this.tmpdir, request.replace(/\//g, "-"));
};

GlobalizeCompilerHelper.prototype.compile = function(locale, request) {
  var messages = this.messages;

  var attributes = {
    cldr: this.cldr,
    defaultLocale: locale,
    extracts: request ? this.getExtract(request) : this.extracts
  };

  if (messages[locale]) {
    attributes.messages = messages[locale];
  }

  this.webpackCompiler.applyPlugins("globalize-before-generate-bundle", locale, attributes);

  return globalizeCompiler.compileExtracts(attributes)

    // Inject set defaultLocale.
    .replace(/(return Globalize;)/, "Globalize.locale(\"" + locale + "\"); $1");
};

GlobalizeCompilerHelper.prototype.isCompiledDataModule = function(request) {
  return this.modules[request];
};


module.exports = GlobalizeCompilerHelper;
