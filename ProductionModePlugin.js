"use strict";

const CommonJsRequireDependency = require("webpack/lib/dependencies/CommonJsRequireDependency");
const GlobalizeCompilerHelper = require("./GlobalizeCompilerHelper");
const MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
const NormalModuleReplacementPlugin = require("webpack/lib/NormalModuleReplacementPlugin");
const PatchedRawModule = require("./PatchedRawModule");
const SkipAMDPlugin = require("skip-amd-webpack-plugin");
const util = require("./util");

/**
 * Production Mode:
 * - Have Globalize modules replaced with their runtime modules.
 * - Statically extracts formatters and parsers from user code and pre-compile
 *   them into globalize-compiled-data chunks.
 */
class ProductionModePlugin {
  constructor(attributes) {
    this.cldr = attributes.cldr || util.cldr;
    this.developmentLocale = attributes.developmentLocale;
    this.messages = attributes.messages && attributes.supportedLocales.reduce((sum, locale) => {
      sum[locale] = util.readMessages(attributes.messages, locale) || {};
      return sum;
    }, {});
    this.moduleFilter = util.moduleFilterFn(attributes.moduleFilter);
    this.supportedLocales = attributes.supportedLocales;
    this.output = attributes.output;
    this.timeZoneData = attributes.timeZoneData || util.timeZoneData;
    const tmpdirBase = attributes.tmpdirBase || ".";
    this.tmpdir = util.tmpdir(tmpdirBase);
  }

  apply(compiler) {
    let globalizeSkipAMDPlugin;
    const output = this.output || "i18n-[locale].js";
    const globalizeCompilerHelper = new GlobalizeCompilerHelper({
      cldr: this.cldr,
      developmentLocale: this.developmentLocale,
      messages: this.messages,
      timeZoneData: this.timeZoneData,
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

    const bindParser = (parser) => {

      // Map each AST and its request filepath.
      parser.plugin("program", (ast) => {
        globalizeCompilerHelper.setAst(parser.state.current.request, ast);
      });

      // "Intercepts" all `require("globalize")` by transforming them into a
      // `require` to our custom precompiled formatters/parsers, which in turn
      // requires Globalize, set the default locale and then exports the
      // Globalize object.
      parser.plugin("call require:commonjs:item", (expr, param) => {
        const request = parser.state.current.request;
        if(param.isString() && param.string === "globalize" && this.moduleFilter(request) &&
          !(globalizeCompilerHelper.isCompiledDataModule(request))) {

          // Extract Globalize formatters and parsers for all the locales. Webpack
          // allocates distinct moduleIds per locale, enabling multiple locales to
          // be used at the same time.
          this.supportedLocales.forEach((locale) => {
            // Statically extract Globalize formatters and parsers from the request
            // file only. Then, create a custom precompiled formatters/parsers module
            // that will be called instead of Globalize, which in turn requires
            // Globalize, set the default locale and then exports the Globalize
            // object.
            const compiledDataFilepath = globalizeCompilerHelper.createCompiledDataModule(request, locale);

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

            // Add localized Globalize formatters and parsers as dependencies
            // Replace require("globalize") with require(<custom precompiled module of
            // developmentLocale>).
            const dep = new CommonJsRequireDependency(compiledDataFilepath, locale == this.developmentLocale ? param.range : null);
            dep.loc = expr.loc;
            dep.optional = !!parser.scope.inTry;
            parser.state.current.addDependency(dep);
          });

          return true;
        }
      });
    };

    // Create globalize-compiled-data chunks for the supportedLocales.
    compiler.plugin("entry-option", (context) => {
      this.supportedLocales.forEach((locale) => {
        compiler.apply(new MultiEntryPlugin(context, [], "globalize-compiled-data-" + locale ));
      });
    });

    // Place the Globalize compiled data modules into the globalize-compiled-data
    // chunks.
    let allModules;
    compiler.plugin("this-compilation", (compilation) => {
      compilation.plugin("optimize-modules", (modules) => {
        allModules = modules;
      });
    });

    compiler.plugin("this-compilation", (compilation) => {
      compilation.plugin("after-optimize-chunks", (chunks) => {
        let hasAnyModuleBeenIncluded;
        const compiledDataChunks = new Map(
          chunks.filter((chunk) => /globalize-compiled-data/.test(chunk.name)).
                 map(chunk => [chunk.name.replace("globalize-compiled-data-", ""), chunk] )
        );

        allModules.forEach((module) => {
          let chunkRemoved;
          if (globalizeCompilerHelper.isCompiledDataModule(module.request)) {
            hasAnyModuleBeenIncluded = true;
            module.getChunks().forEach((chunk) => {
              chunkRemoved = module.removeChunk(chunk);
              if (!chunkRemoved) {
                throw new Error("Failed to remove chunk " + chunk.id + " for module " + module.request);
              }
            });
            for (let [locale, chunk] of compiledDataChunks.entries()) {
              if (module.request.endsWith(locale + ".js")) {
                chunk.addModule(module);
                module.addChunk(chunk);
              }
            }
          }
        });
        for (let [locale, chunk] of compiledDataChunks.entries()) {
          chunk.filenameTemplate = output.replace("[locale]", locale);
        }
        if(!hasAnyModuleBeenIncluded) {
          console.warn("No Globalize compiled data module found");
        }
      });

      // Have each globalize-compiled-data chunks include precompiled data for
      // each supported locale. In each chunk, merge all the precompiled modules
      // into a single one. Finally, allow the chunks to be loaded incrementally
      // (not mutually exclusively). Details below.
      //
      // Up to this step, all globalize-compiled-data chunks include several
      // precompiled modules, which have been mandatory to allow webpack to figure
      // out the Globalize runtime dependencies. But for the final chunk we need
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
      //    included in the entry module of each of these chunks.
      //    So, we accomplish what we need: have the data loaded as soon as the
      //    chunk is loaded, which means it will be available when each
      //    individual parent code needs it.
      compilation.plugin("after-optimize-module-ids", () => {
        const globalizeModuleIds = [];
        const globalizeModuleIdsMap = {};

        compilation.chunks.forEach((chunk) => {
          chunk.forEachModule((module) => {
            let aux;
            const request = module.request;
            if (request && util.isGlobalizeRuntimeModule(request)) {
              // While request has the full pathname, aux has something like
              // "globalize/dist/globalize-runtime/date".
              aux = request.split(/[\/\\]/);
              aux = aux.slice(aux.lastIndexOf("globalize")).join("/").replace(/\.js$/, "");

              // some plugins, like HashedModuleIdsPlugin, may change module ids
              // into strings.
              let moduleId = module.id;
              if (typeof moduleId === "string") {
                moduleId = JSON.stringify(moduleId);
              }

              globalizeModuleIds.push(moduleId);
              globalizeModuleIdsMap[aux] = moduleId;
            }
          });
        });

        // rewrite the modules in the localized chunks:
        //   - entry module will contain the compiled formatters and parsers
        //   - non-entry modules will be rewritten to export globalize
        compilation.chunks
          .filter((chunk) => /globalize-compiled-data/.test(chunk.name))
          .forEach((chunk) => {
            // remove dead entry module for these reasons
            //   - because the module has no dependencies, it won't be rendered
            //     with __webpack_require__, making it difficult to modify its
            //     source in a way that can import globalize
            //
            //   - it was a placeholder MultiModule that held no content, created
            //     when we added a MultiEntryPlugin
            //
            //   - the true entry module should be globalize-compiled-data
            //     module, which has been created as a NormalModule
            chunk.removeModule(chunk.entryModule);
            chunk.entryModule = chunk.getModules().find((module) => module.context.endsWith(".tmp-globalize-webpack"));

            const newModules = chunk.mapModules((module) => {
              let fnContent;
              if (module === chunk.entryModule) {
                // rewrite entry module to contain the globalize-compiled-data
                const locale = chunk.name.replace("globalize-compiled-data-", "");
                fnContent = globalizeCompilerHelper.compile(locale)
                  .replace("typeof define === \"function\" && define.amd", "false")
                  .replace(/require\("([^)]+)"\)/g, (garbage, moduleName) => {
                    return `__webpack_require__(${globalizeModuleIdsMap[moduleName]})`;
                  });
              } else {
                // rewrite all other modules in this chunk as proxies for
                // Globalize
                fnContent = `module.exports = __webpack_require__(${globalizeModuleIds[0]});`;
              }

              // The `module` object in scope here is in each locale chunk, and
              // any modifications we make will be rendered into every locale
              // chunk. Create a new module to contain the locale-specific source
              // modifications we've made.
              const newModule = new PatchedRawModule(fnContent);
              newModule.context = module.context;
              newModule.id = module.id;
              newModule.dependencies = module.dependencies;
              return newModule;
            });

            // remove old modules with modified clones
            // chunk.removeModule doesn't always find the module to remove
            // ¯\_(ツ)_/¯, so we have to be be a bit more thorough here.
            chunk.forEachModule((module) => module.removeChunk(chunk));

            // install the rewritten modules
            chunk.setModules(newModules);
          });
      });


      // Set the right chunks order. The globalize-compiled-data chunks must
      // appear after globalize runtime modules, but before any app code.
      compilation.plugin("optimize-chunk-order", (chunks) => {
        const cachedChunkScore = {};
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
            cachedChunkScore[chunk.name] = chunk.getModules().reduce((sum, module) => {
              return Math.max(sum, moduleScore(module));
            }, -1);
          }
          return cachedChunkScore[chunk.name];
        }
        chunks.sort((a, b) => chunkScore(a) - chunkScore(b));
      });
    });

    compiler.plugin("compilation", (compilation, params) => {
      params.normalModuleFactory.plugin("parser", bindParser);
    });
  }
}

module.exports = ProductionModePlugin;
