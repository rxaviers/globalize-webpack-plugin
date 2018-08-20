"use strict";

const fs = require("fs");
const globalizeCompiler = require("globalize-compiler");
const path = require("path");
const { SyncHook } = require("tapable");

class GlobalizeCompilerHelper {
  constructor(attributes) {
    this.asts = {};
    this.extracts = [];
    this.extractsMap = {};
    this.modules = {};

    this.cldr = attributes.cldr;
    this.developmentLocale = attributes.developmentLocale;
    this.messages = attributes.messages || {};
    this.timeZoneData = attributes.timeZoneData;
    this.tmpdir = attributes.tmpdir;
    this.webpackCompiler = attributes.webpackCompiler;
    this.webpackCompiler.hooks.globalizeBeforeCompileExtracts = new SyncHook(["locale", "attributes", "request"]);
  }

  setAst(request, ast) {
    this.asts[request] = ast;
  }

  getExtract(request) {
    let ast, extract;
    if(!this.extractsMap[request]) {
      ast = this.asts[request];
      extract = globalizeCompiler.extract(ast);
      this.extractsMap[request] = extract;
      this.extracts.push(extract);
    }
    return this.extractsMap[request];
  }

  createCompiledDataModule(request, locale) {
    const filepath = this.getModuleFilepath(request, locale);
    this.modules[filepath] = true;

    fs.writeFileSync(filepath, this.compile(locale, request));

    return filepath;
  }

  getModuleFilepath(request, locale) {
    // Always append .js to the file path to cater for non-JS files (e.g. .coffee).
    return path.join(this.tmpdir, request.replace(/.*!/, "").replace(/[\/\\?" :\.]/g, "-") + "-" + locale + ".js");
  }

  compile(locale, request) {
    let content;

    const attributes = {
      cldr: this.cldr,
      defaultLocale: locale,
      extracts: request ? this.getExtract(request) : this.extracts,
      timeZoneData: this.timeZoneData
    };

    if (this.messages[locale]) {
      attributes.messages = this.messages[locale];
    }

    this.webpackCompiler.hooks.globalizeBeforeCompileExtracts.call(locale, attributes, request);

    try {
      content = globalizeCompiler.compileExtracts(attributes);
    } catch(e) {
      // The only case to throw is when it's missing formatters/parsers for the
      // whole chunk, i.e., when `request` isn't present; or when error is
      // something else obviously. If a particular file misses formatters/parsers,
      // it can be safely ignored (i.e., by using a stub content), because in the
      // end generating the content for the whole chunk will ultimately verify
      // whether or not formatters/parsers has been used.
      if (!/No formatters or parsers has been provided/.test(e.message) || !request) {
        throw e;
      }
      content = "module.exports = require(\"globalize\");";
    }

    // Inject set defaultLocale.
    return content.replace(/(return Globalize;)/, "Globalize.locale(\"" + locale + "\"); $1");
  }

  isCompiledDataModule(request) {
    return request && this.modules[request.replace(/.*!/, "")];
  }
}

module.exports = GlobalizeCompilerHelper;
