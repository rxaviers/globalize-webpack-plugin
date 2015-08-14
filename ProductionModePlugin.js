var cldrData = require("cldr-data");
var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var fs = require("fs");
var globalizeCompiler = require("globalize-compiler");
var InCommonPlugin = require("./InCommonPlugin");
var MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
var NormalModuleReplacementPlugin = require("webpack/lib/NormalModuleReplacementPlugin");
var path = require("path");
var SkipAMDPlugin = require("skip-amd-webpack-plugin");
var util = require("./util");

function GlobalizeCompilerHelper(attributes) {
  InCommonPlugin.apply(this, arguments);

  this.asts = {};
  this.extracts = {};
  this.modules = {};

  this.compiler = attributes.compiler;
  this.developmentLocale = attributes.developmentLocale;
  this.messages = attributes.messages;
}

GlobalizeCompilerHelper.prototype.setAst = function(request, ast) {
  this.asts[request] = ast;
};

GlobalizeCompilerHelper.prototype.getExtract = function(request) {
  var ast;
  if(!this.extracts[request]) {
    ast = this.asts[request];
    this.extracts[request] = globalizeCompiler.extract(ast);
  }
  return this.extracts[request];
};

GlobalizeCompilerHelper.prototype.createModule = function(request) {
  var filepath = this.getModuleFilepath(request);
  this.modules[filepath] = true;

  fs.writeFileSync(filepath, this.compile(request));

  return filepath;
};

GlobalizeCompilerHelper.prototype.getModuleFilepath = function(request) {
  return path.join(this.tmpdir, request.replace(/\//g, "-"));
};

GlobalizeCompilerHelper.prototype.compile = function(request) {
  var locale = this.developmentLocale;
  var messages = this.messages;

  var attributes = {
    defaultLocale: locale,
    extracts: this.getExtract(request)
  };

  if (messages[locale]) {
    attributes.messages = messages[locale];
  }

  this.compiler.applyPlugins("globalize-before-generate-bundle", locale, attributes);

  return globalizeCompiler.compileExtracts(attributes)

    // Inject set defaultLocale.
    .replace(/(return Globalize;)/, "Globalize.locale(\"" + locale + "\"); $1");
};

GlobalizeCompilerHelper.prototype.isCompiledDataModule = function(request) {
  return this.modules[request];
};

/**
 * Production Mode:
 * - Have Globalize modules replaced with their runtime modules.
 * - Statically extracts formatters and parsers from user code and pre-compile
 *   them into respective XXXX.
 */
function ProductionModePlugin(attributes) {
  this.cldr = attributes.cldr || function(locale) {
    return cldrData.entireSupplemental().concat(cldrData.entireMainFor(locale));
  };
  this.developmentLocale = attributes.developmentLocale;
  this.messages = attributes.messages && attributes.supportedLocales.reduce(function(sum, locale) {
    sum[locale] = util.readMessages(attributes.messages, locale); 
    return sum;
  }, {});
  this.supportedLocales = attributes.supportedLocales;
  this.output = attributes.output;
}

ProductionModePlugin.prototype.apply = function(compiler) {
  //var cldr = this.cldr;
  var developmentLocale = this.developmentLocale;
  var messages = this.messages;
  var output = this.output || "i18n-[locale].js";

  var globalizeCompilerHelper = new GlobalizeCompilerHelper({
    compiler: compiler,
    developmentLocale: developmentLocale,
    messages: messages
  });

  compiler.apply(
    new InCommonPlugin(),

    // Replaces `require("globalize")` with `require("globalize/dist/globalize-runtime")`.
    new NormalModuleReplacementPlugin(/(^|\/)globalize$/, "globalize/dist/globalize-runtime"),

    // Skip AMD part of Globalize Runtime UMD wrapper.
    new SkipAMDPlugin(/(^|\/)globalize-runtime($|\/)/)
  );

  // Statically extract Globalize formatters and parsers.
  compiler.parser.plugin("program", function(ast) {
    globalizeCompilerHelper.setAst(this.state.current.request, ast);
  });

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom precompiled formatters/parsers, which in turn
  // requires Globalize, set the default locale and then exports the
  // Globalize object.
  compiler.parser.plugin("call require:commonjs:item", function(expr, param) {
    var request = this.state.current.request;
    if(param.isString() && param.string === "globalize" &&
          !util.isGlobalizeModule(request) &&
          !(globalizeCompilerHelper.isCompiledDataModule(request))) {
          //!(new RegExp(i18nDataFile)).test(request)/*FIXME*/) {
      var dep;

      var compiledDataFilepath = globalizeCompilerHelper.createModule(request);

      // Skip AMD part of the compiled i18n-data UMD wrapper.
      compiler.apply(
        new SkipAMDPlugin(new RegExp(compiledDataFilepath))
      );

      dep = new CommonJsRequireDependency(compiledDataFilepath, param.range);
      dep.loc = expr.loc;
      dep.optional = !!this.scope.inTry;
      this.state.current.addDependency(dep);

      return true;
    }
  });

  // i18n-data chunk
  // - Create i18n-data chunk.
  compiler.plugin("entry-option", function(context) {
    compiler.apply(new MultiEntryPlugin(context, [], "globalize-compiled-data"));
  });

  // - Place i18nDataFile module into i18n-data chunk.
  compiler.plugin("this-compilation", function(compilation) {
    compilation.plugin("after-optimize-chunks", function(chunks) {
      var CompiledDataDataChunk = chunks.filter(function(chunk) {
        return chunk.name === "globalize-compiled-data";
      })[0];
      chunks.forEach(function(chunk) {
        chunk.modules.forEach(function(module) {
          if (globalizeCompilerHelper.isCompiledDataModule(module.request)) {
          // FIXME if ((new RegExp(i18nDataFile)).test(module.request)) {
            module.removeChunk(chunk);
            CompiledDataDataChunk.addModule(module);
            module.addChunk(CompiledDataDataChunk);
          }
        });
      });
      CompiledDataDataChunk.filenameTemplate = output.replace("[locale]", developmentLocale);
    });

    compilation.plugin("optimize-chunk-order", function(chunks) {
      // FIXME
      /*
      function definesGlobalize(chunk) {
        return chunk.modules.some(function(module) {
          // TODO: Update condition for isGlobalizeModule(...).
          if( /(^|\/)globalize($|\/)/.test(module.resource)) {
            console.log(module.resource);
          }
          return /(^|\/)globalize($|\/)/.test(module.resource);
        });
      }
      function definesI18nData(chunk) {
        return chunk.modules.some(function(module) {
          return globalizeCompilerHelper.isCompiledDataModule(module.request);
        });
      }
      console.log("boo");
      chunks.forEach(function(c) {
        console.log("###", c.name);
        c.modules.forEach(function(m) {
          console.log(m.resource);
        });
      });
      chunks.sort(function(a, b) {
        var aValue = definesGlobalize(a) ? 3 : definesI18nData(a) ? 2 : 1;
        var bValue = definesGlobalize(b) ? 3 : definesI18nData(b) ? 2 : 1;
        console.log("-", a.name, aValue, b.name, bValue);
        return bValue - aValue;
      });
      */
      var sortOrder = ["globalize-compiled-data", "vendor"];
      chunks.sort(function(a, b) {
        return sortOrder.indexOf(a.name) - sortOrder.indexOf(b.name);
      });
    });
  });

  // ------------------------------
  return;

  /*
  compiler.plugin("normal-module-factory", function(nmf) {
    nmf.plugin("module", function(result) {
      console.log(result);
    });
  });

  // Statically extract Globalize formatters and parsers
  compiler.plugin("compilation", function(compilation) {
    compilation.plugin("optimize-chunk-assets", function(chunks, callback) {
      var files = [];
      chunks.forEach(function(chunk) {
        chunk.files.forEach(function(file) {
          files.push(file);
        });
      });
      compilation.additionalChunkAssets.forEach(function(file) {
        files.push(file);
      });

      files.filter(function(file) {
        return /\.js($|\?)/i.test(file);
      }).forEach(function(file) {
        var asset = compilation.assets[file];
        console.log(file, globalizeExtractor(asset.source())().length);
      });
      
        
      callback();
    });
  });
  */
};

module.exports = ProductionModePlugin;
