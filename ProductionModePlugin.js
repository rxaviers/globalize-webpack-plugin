var cldrData = require("cldr-data");
var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var fs = require("fs");
var globalizeCompiler = require("globalize-compiler");
var InCommonPlugin = require("./InCommonPlugin");
var MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
var NormalModuleReplacementPlugin = require("webpack/lib/NormalModuleReplacementPlugin");
var path = require("path");
var SkipAMDOfUMDPlugin = require("skip-amd-webpack-plugin");

/**
 * Production Mode:
 * - Have Globalize modules replaced with their runtime modules.
 * - Statically extracts formatters and parsers from user code and pre-compile
 *   them into respective XXXX.
 */
function ProductionModePlugin(attributes) {
  this.i18nDataFile = path.resolve("./.globalize-prod-i18n-data.js");
  this.defaultLocale = attributes.defaultLocale;
  this.cldr = attributes.cldr || function(locale) {
    return cldrData.entireSupplemental().concat(cldrData.entireMainFor(locale));
  };
}

ProductionModePlugin.prototype.apply = function(compiler) {
  var cache = {
    i18nDataContent: {}
  };
  var defaultLocale = this.defaultLocale;
  var extracts = [];
  var i18nDataFile = this.i18nDataFile;
  //var cldr = this.cldr;

  function injectSetDefaultLocale(bundle, locale) {
    return bundle.replace(/(return Globalize;)/, "Globalize.locale(\"" + locale + "\"); $1");
  }

  function i18nDataContent(locale) {
    var attributes;
    if (!cache.i18nDataContent[locale]) {
      attributes = {
        defaultLocale: locale,
        extracts: extracts
      };
      compiler.applyPlugins("globalize-before-generate-bundle", locale, attributes);
      cache.i18nDataContent[locale] = injectSetDefaultLocale(
        globalizeCompiler.compileExtracts(attributes),
        locale
      );
    }
    return cache.i18nDataContent[locale];
  }

  compiler.apply(
    new InCommonPlugin(),

    // Replaces `require("globalize")` with `require("globalize/dist/globalize-runtime")`.
    new NormalModuleReplacementPlugin(/(^|\/)globalize$/, "globalize/dist/globalize-runtime"),

    // Skip AMD part of Globalize Runtime UMD wrapper.
    new SkipAMDOfUMDPlugin(/(^|\/)globalize-runtime($|\/)/),

    // Skip AMD part of the compiled i18n-data UMD wrapper.
    new SkipAMDOfUMDPlugin(new RegExp(i18nDataFile))
  );

  // Statically extract Globalize formatters and parsers.
  compiler.parser.plugin("program", function(ast) {
    extracts.push(globalizeCompiler.extract(ast));
  });

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom precompiled formatters/parsers, which in turn
  // requires Globalize, loads CLDR, set the default locale and then exports the
  // Globalize object.
  compiler.parser.plugin("call require:commonjs:item", function(expr, param) {
    if(param.isString() && param.string === "globalize" &&
          !(/(^|\/)globalize($|\/)/).test(this.state.current.request) &&
          !(new RegExp(i18nDataFile)).test(this.state.current.request)) {
      var dep;

      fs.writeFileSync(i18nDataFile, i18nDataContent(defaultLocale));
      dep = new CommonJsRequireDependency(i18nDataFile, param.range);
      dep.loc = expr.loc;
      dep.optional = !!this.scope.inTry;
      this.state.current.addDependency(dep);

      return true;
    }
  });

  // i18n-data chunk
  // - Create i18n-data chunk.
  compiler.plugin("entry-option", function(context) {
    compiler.apply(new MultiEntryPlugin(context, [], "i18n-data"));
  });

  // - Place i18nDataFile module into i18n-data chunk.
  compiler.plugin("this-compilation", function(compilation) {
    compilation.plugin("after-optimize-chunks", function(chunks) {
      var i18nDataChunk = chunks.filter(function(chunk) {
        return chunk.name === "i18n-data";
      })[0];
      chunks.forEach(function(chunk) {
        chunk.modules.forEach(function(module) {
          if ((new RegExp(i18nDataFile)).test(module.request)) {
            module.removeChunk(chunk);
            i18nDataChunk.addModule(module);
            module.addChunk(i18nDataChunk);
          }
        });
      });
      i18nDataChunk.filenameTemplate = "app-en.[hash].js";
    });

    compilation.plugin("optimize-chunk-order", function(chunks) {
      // FIXME
      /*
      function definesGlobalize(chunk) {
        return chunk.modules.some(function(module) {
          if( /(^|\/)globalize($|\/)/.test(module.resource)) {
            console.log(module.resource);
          }
          return /(^|\/)globalize($|\/)/.test(module.resource);
        });
      }
      function definesI18nData(chunk) {
        return chunk.modules.some(function(module) {
          return (new RegExp(i18nDataFile)).test(module.resource);
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
      var sortOrder = ["i18n-data", "vendor"];
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
