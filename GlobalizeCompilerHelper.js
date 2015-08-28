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
  this.messages = attributes.messages || {};
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
  return path.join(this.tmpdir, request.replace(/.*!/, "").replace(/[/?" ]/g, "-"));
};

GlobalizeCompilerHelper.prototype.compile = function(locale, request) {
  var content;
  var messages = this.messages;

  var attributes = {
    cldr: this.cldr,
    defaultLocale: locale,
    extracts: request ? this.getExtract(request) : this.extracts
  };

  if (messages[locale]) {
    attributes.messages = messages[locale];
  }

  this.webpackCompiler.applyPlugins("globalize-before-compile-extracts", locale, attributes, request);

  try {
    content = globalizeCompiler.compileExtracts(attributes);
  } catch(e) {
    // The only case to throw is when it's missing formatters/parsers for the
    // whole chunk, i.e., when `request` isn't present; or when error is
    // something else obviously. If a particular file misses formatters/parsers,
    // it can be safely ignored (i.e., by using a stub content), because in the
    // end generating the content for the whole chunk will ultimately verify
    // whether of not no formatters/parsers has been used.
    if (!/No formatters or parsers has been provided/.test(e.message) || !request) {
      throw e;
    }
    content = "module.exports = {};";
  }

  // Inject set defaultLocale.
  return content.replace(/(return Globalize;)/, "Globalize.locale(\"" + locale + "\"); $1");
};

GlobalizeCompilerHelper.prototype.isCompiledDataModule = function(request) {
  return this.modules[request];
};


module.exports = GlobalizeCompilerHelper;
