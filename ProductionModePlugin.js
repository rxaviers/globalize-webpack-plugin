var CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
var ConcatSource = require("webpack-sources").ConcatSource;
var GlobalizeCompilerHelper = require("./GlobalizeCompilerHelper");
var ModuleFilenameHelpers = require("webpack/lib/ModuleFilenameHelpers");
var MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
var NormalModuleReplacementPlugin = require("webpack/lib/NormalModuleReplacementPlugin");
var SkipAMDPlugin = require("skip-amd-webpack-plugin");
var util = require("./util");

/**
 * Production Mode:
 * - Have Globalize modules replaced with their runtime modules.
 * - Statically extracts formatters and parsers from user code and pre-compile
 *   them into globalize-compiled-data chunks.
 */
function ProductionModePlugin(attributes) {
  this.cldr = attributes.cldr || util.cldr;
  this.developmentLocale = attributes.developmentLocale;
  this.messages = attributes.messages && attributes.supportedLocales.reduce(function(sum, locale) {
    sum[locale] = util.readMessages(attributes.messages, locale) || {};
    return sum;
  }, {});
  this.moduleFilter = util.moduleFilterFn(attributes.moduleFilter);
  this.supportedLocales = attributes.supportedLocales;
  this.output = attributes.output;
  this.tmpdir = util.tmpdir();
}

ProductionModePlugin.prototype.apply = function(compiler) {
  var globalizeSkipAMDPlugin;
  var cldr = this.cldr;
  var developmentLocale = this.developmentLocale;
  var moduleFilter = this.moduleFilter;
  var messages = this.messages;
  var supportedLocales = this.supportedLocales;
  var output = this.output || "i18n-[locale].js";

  var globalizeCompilerHelper = new GlobalizeCompilerHelper({
    cldr: cldr,
    developmentLocale: developmentLocale,
    messages: messages,
    tmpdir: this.tmpdir,
    webpackCompiler: compiler
  });

  compiler.apply(
    // Skip AMD part of Globalize Runtime UMD wrapper.
    globalizeSkipAMDPlugin = new SkipAMDPlugin(/(^|[\/\\])globalize($|[\/\\])/),

    // Replaces `require("globalize")` with `require("globalize/dist/globalize-runtime")`.
    new NormalModuleReplacementPlugin(/(^|[\/\\])globalize$/, "globalize/dist/globalize-runtime"),

    // Skip AMD part of Globalize Runtime UMD wrapper.
    new SkipAMDPlugin(/(^|[\/\\])globalize-runtime($|[\/\\])/)
  );

  // Map each AST and its request filepath.
  compiler.plugin('compilation', function(compilation, data) {
    data.normalModuleFactory.plugin('parser', function(parser) {
      parser.plugin("program", function(ast) {
        globalizeCompilerHelper.setAst(this.state.current.request, ast);
      })
    })
  });

  // "Intercepts" all `require("globalize")` by transforming them into a
  // `require` to our custom precompiled formatters/parsers, which in turn
  // requires Globalize, set the default locale and then exports the
  // Globalize object.
  compiler.plugin('compilation', function(compilation, data) {
    data.normalModuleFactory.plugin('parser', function(parser) {
      parser.plugin("call require:commonjs:item", function(expr, param) {
        var request = this.state.current.request;
        if(param.isString() && param.string === "globalize" && moduleFilter(request) &&
          !(globalizeCompilerHelper.isCompiledDataModule(request))) {
          var dep;

          // Statically extract Globalize formatters and parsers from the request
          // file only. Then, create a custom precompiled formatters/parsers module
          // that will be called instead of Globalize, which in turn requires
          // Globalize, set the default locale and then exports the Globalize
          // object.
          var compiledDataFilepath = globalizeCompilerHelper.createCompiledDataModule(request);

          // Skip the AMD part of the custom precompiled formatters/parsers UMD
          // wrapper.
          //
          // Note: We're hacking an already created SkipAMDPlugin instance instead
          // of using a regular code like the below in order to take advantage of
          // its position in the plugins list. Otherwise, it'd be too late to plugin
          // and AMD would no longer be skipped at this point.
          //
          // compiler.apply(new SkipAMDPlugin(new RegExp(compiledDataFilepath));
          //
          // 1: Removes the leading and the trailing `/` from the regexp string.
          globalizeSkipAMDPlugin.requestRegExp = new RegExp([
            globalizeSkipAMDPlugin.requestRegExp.toString().slice(1, -1)/* 1 */,
            util.escapeRegex(compiledDataFilepath)
          ].join("|"));

          // Replace require("globalize") with require(<custom precompiled module>).
          dep = new CommonJsRequireDependency(compiledDataFilepath, param.range);
          dep.loc = expr.loc;
          dep.optional = !!this.scope.inTry;
          this.state.current.addDependency(dep);

          return true;
        }
      })
    })
  });

  // Create globalize-compiled-data chunks for the supportedLocales.
  compiler.plugin("entry-option", function(context) {
    supportedLocales.forEach(function(locale) {
      compiler.apply(new MultiEntryPlugin(context, [], "globalize-compiled-data-" + locale ));
    });
  });

  // Place the Globalize compiled data modules into the globalize-compiled-data
  // chunks.
  //
  // Note that, at this point, all compiled data have been compiled for
  // developmentLocale. All globalize-compiled-data chunks will equally include all
  // precompiled modules for the developmentLocale instead of their respective
  // locales. This will get fixed in the subsquent step.
  var allModules;
  compiler.plugin("this-compilation", function(compilation) {
    compilation.plugin("optimize-modules", function(modules) {
      allModules = modules;
    });
  });
  compiler.plugin("this-compilation", function(compilation) {
    compilation.plugin("after-optimize-chunks", function(chunks) {
      var hasAnyModuleBeenIncluded;
      var compiledDataChunks = chunks.filter(function(chunk) {
        return /globalize-compiled-data/.test(chunk.name);
      });
      allModules.forEach(function(module) {
        var chunkRemoved, chunk;
        if (globalizeCompilerHelper.isCompiledDataModule(module.request)) {
          hasAnyModuleBeenIncluded = true;
          while (module.chunks.length) {
            chunk = module.chunks[0];
            chunkRemoved = module.removeChunk(chunk);
            if (!chunkRemoved) {
              throw new Error("Failed to remove chunk " + chunk.id + " for module " + module.request);
            }
          }
          compiledDataChunks.forEach(function(compiledDataChunk) {
            compiledDataChunk.addModule(module);
            module.addChunk(compiledDataChunk);
          });
        }
      });
      compiledDataChunks.forEach(function(chunk) {
        var locale = chunk.name.replace("globalize-compiled-data-", "");
        chunk.filenameTemplate = output.replace("[locale]", locale);
      });
      if(!hasAnyModuleBeenIncluded) {
        console.warn("No Globalize compiled data module found");
      }
    });

    // Have each globalize-compiled-data chunks to include precompiled data for
    // each supportedLocales. On each chunk, merge all the precompiled modules
    // into a single one. Finally, allow the chunks to be loaded incrementally
    // (not mutually exclusively). Details below.
    //
    // Up to this step, all globalize-compiled-data chunks include several
    // precompiled modules, which have been mandatory to allow webpack to figure
    // out the Globalize runtime dependencies. But, for the final chunk we need
    // something a little different:
    //
    // a) Instead of including several individual precompiled modules, it's
    //    better (i.e., reduced size due to less boilerplate and due to deduped
    //    formatters and parsers) having one single precompiled module for all
    //    these individual modules.
    //
    // b) globalize-compiled-data chunks shouldn't be mutually exclusive to each
    //    other, but users should be able to load two or more of these chunks
    //    and be able to switch from one locale to another dynamically during
    //    runtime.
    //
    //    Some background: by having each individual precompiled module defining
    //    the formatters and parsers for its individual parents, what happens is
    //    that each parent will load the globalize precompiled data by its id
    //    with __webpack_require__(id). These ids are equally defined by the
    //    globalize-compiled-data chunks (each chunk including data for a
    //    certain locale). When one chunk is loaded, these ids get defined by
    //    webpack. When a second chunk is loaded, these ids would get
    //    overwritten.
    //
    //    Therefore, instead of having each individual precompiled module
    //    defining the formatters and parsers for its individual parents, we
    //    actually simplify them by returning Globalize only. The precompiled
    //    content for the whole set of formatters and parsers are going to be
    //    included in the id numbered 0 of these chunks. The id 0 has a special
    //    meaning in webpack, it means it's going to be executed as soon as it's
    //    loaded. So, we accomplish what we need: have the data loaded as soon
    //    as the chunk is loaded, which means it will be available when each
    //    individual parent code needs it.
    //
    // OBS: `additional-chunk-assets` is used to make globalize-compiled-data
    // changes right before `optimize-chunk-assets` (used by plugins like
    // Uglify).
    //
    // TODO: Can we do this differently than using regexps?
    compilation.plugin("additional-chunk-assets", function(chunks) {
      var globalizeModuleIds = [];
      var globalizeModuleIdsMap = {};

      chunks.forEach(function(chunk) {
        chunk.modules.forEach(function(module) {
          var aux;
          var request = module.request;
          if (request && util.isGlobalizeRuntimeModule(request)) {
            // While request has the full pathname, aux has something like "globalize/dist/globalize-runtime/date".
            aux = request.split(/[\/\\]/);
            aux = aux.slice(aux.lastIndexOf("globalize")).join("/").replace(/\.js$/, "");
            globalizeModuleIds.push(module.id);
            globalizeModuleIdsMap[aux] = module.id;
          }
        });
      });

      chunks.filter(function(chunk) {
        return /globalize-compiled-data/.test(chunk.name);
      }).forEach(function(chunk) {
        var locale = chunk.name.replace("globalize-compiled-data-", "");
        chunk.files.filter(ModuleFilenameHelpers.matchObject).forEach(function(file) {
          var isFirst = true;
          var source = compilation.assets[file].source().replace(/\n\/\*\*\*\/ function\(module, exports(, __webpack_require__)?\) {[\s\S]*?(\n\/\*\*\*\/ })/g, function(garbage1, garbage2, fnTail) {
            var fnContent;

            // Define the initial module 0 as the whole formatters and parsers.
            if (isFirst) {
              isFirst = false;
              fnContent = globalizeCompilerHelper.compile(locale)
                .replace("typeof define === \"function\" && define.amd", "false")
                .replace(/require\("([^)]+)"\)/g, function(garbage, moduleName) {
                  return "__webpack_require__(" + globalizeModuleIdsMap[moduleName] + ")";
                });

            // Define all other individual globalize compiled data as a simple exports to Globalize.
            } else {
              fnContent = "module.exports = __webpack_require__(" + globalizeModuleIds[0] + ");";
            }

            return "\n/***/ function(module, exports, __webpack_require__) {\n" + fnContent + fnTail;
          });
          compilation.assets[file] = new ConcatSource(source);
        });
      });
    });

    // Set the right chunks order. The globalize-compiled-data chunks must
    // appear after globalize runtime modules, but before any app code.
    compilation.plugin("optimize-chunk-order", function(chunks) {
      var cachedChunkScore = {};
      function moduleScore(module) {
        if (module.request && util.isGlobalizeRuntimeModule(module.request)) {
          return 1;
        } else if (module.request && globalizeCompilerHelper.isCompiledDataModule(module.request)) {
          return 0;
        }
        return -1;
      }
      function chunkScore(chunk) {
        if (!cachedChunkScore[chunk.name]) {
          cachedChunkScore[chunk.name] = chunk.modules.reduce(function(sum, module) {
            var score = moduleScore(module);
            return Math.max(sum, score);
          }, -1);
        }
        return cachedChunkScore[chunk.name];
      }
      chunks.sort(function(a, b) {
        return chunkScore(a) - chunkScore(b);
      });
    });
  });
};

module.exports = ProductionModePlugin;
