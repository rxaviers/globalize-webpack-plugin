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
    const globalizeSkipAMDPlugin = new SkipAMDPlugin(/(^|[\/\\])globalize($|[\/\\])/);
    const normalModuleReplacementPlugin = new NormalModuleReplacementPlugin(/(^|[\/\\])globalize$/, "globalize/dist/globalize-runtime");
    const globalizeRuntimeskipAMDPlugin = new SkipAMDPlugin(/(^|[\/\\])globalize-runtime($|[\/\\])/);
    const output = this.output || "i18n-[locale].js";
    const globalizeCompilerHelper = new GlobalizeCompilerHelper({
      cldr: this.cldr,
      developmentLocale: this.developmentLocale,
      messages: this.messages,
      timeZoneData: this.timeZoneData,
      tmpdir: this.tmpdir,
      webpackCompiler: compiler
    });

    if (compiler.hooks) {
      // Skip AMD part of Globalize Runtime UMD wrapper.
      globalizeSkipAMDPlugin.apply(compiler);

      // Replaces `require("globalize")` with `require("globalize/dist/globalize-runtime")`.
      normalModuleReplacementPlugin.apply(compiler);

      // Skip AMD part of Globalize Runtime UMD wrapper.
      globalizeRuntimeskipAMDPlugin.apply(compiler);
    } else {
      compiler.apply(
        // Skip AMD part of Globalize Runtime UMD wrapper.
        globalizeSkipAMDPlugin,

        // Replaces `require("globalize")` with `require("globalize/dist/globalize-runtime")`.
        normalModuleReplacementPlugin,

        // Skip AMD part of Globalize Runtime UMD wrapper.
        globalizeRuntimeskipAMDPlugin
      );
    }

    const bindParser = (parser) => {
      const programHook = (ast) => {
        globalizeCompilerHelper.setAst(parser.state.current.request, ast);
      };

      const requireHook = (expr, param) => {
        const request = parser.state.current.request;
        if (param.isString() && param.string === "globalize" && this.moduleFilter(request) &&
          !(globalizeCompilerHelper.isCompiledDataModule(request))) {

          // (a) Extract Globalize formatters & parsers, then create a custom
          //     precompiled formatters & parsers module.
          // (b) Add a dependency to the precompiled module. Note
          //     `require("globalize")` doesn't get replaced by `require(<custom
          //     precompiled module>)` because we do NOT `return true` here (as
          //     intended).
          //
          // Why to iterate over all the locales? Webpack allocates distinct
          // moduleIds per locale, enabling multiple locales to be used at the
          // same time.
          this.supportedLocales.forEach((locale) => {
            /* a */
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

            /* b */
            const dep = new CommonJsRequireDependency(compiledDataFilepath, null);
            dep.loc = expr.loc;
            dep.optional = !!parser.scope.inTry;
            parser.state.current.addDependency(dep);
          });
        }
      };

      // Map each AST and its request filepath.
      if (parser.hooks) {
        parser.hooks.program.tap("GlobalizePlugin", programHook);
      } else {
        parser.plugin("program", programHook);
      }

      // Precompile formatters & parsers from modules that `require("globalize")`.
      if (parser.hooks) {
        parser.hooks.call
          .for("require")
          .tap("GlobalizePlugin", (expr) => {
            if (expr.arguments.length !== 1) return;
            const param = parser.evaluateExpression(expr.arguments[0]);
            requireHook(expr, param);
          });
      } else {
        parser.plugin("call require:commonjs:item", requireHook);
      }
    };

    const entryOptionHook = (context) => {
      this.supportedLocales.forEach((locale) => {
        const multiEntryPlugin = new MultiEntryPlugin(context, [], "globalize-compiled-data-" + locale);
        if (compiler.hooks) {
          multiEntryPlugin.apply(compiler);
        } else {
          compiler.apply(multiEntryPlugin);
        }
      });
    };

    // Create globalize-compiled-data chunks for the supportedLocales.
    if (compiler.hooks) {
      compiler.hooks.entryOption.tap("GlobalizePlugin", entryOptionHook);
    } else {
      compiler.plugin("entry-option", entryOptionHook);
    }

    // Place the Globalize compiled data modules into the globalize-compiled-data
    // chunks.
    let allModules;
    const thisCompilationOptimizeModulesHook = (compilation) => {
      const optimizeModulesHook = (modules) => {
        allModules = modules;
      };

      if (compilation.hooks) {
        compilation.hooks.optimizeModules.tap("GlobalizePlugin", optimizeModulesHook);
      } else {
        compilation.plugin("optimize-modules", optimizeModulesHook);
      }
    };

    if (compiler.hooks) {
      compiler.hooks.thisCompilation.tap("GlobalizePlugin", thisCompilationOptimizeModulesHook);
    } else {
      compiler.plugin("this-compilation", thisCompilationOptimizeModulesHook);
    }

    const thisCompilationHook = (compilation) => {
      const afterOptimizeChunksHook = (chunks) => {
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
      };

      if (compilation.hooks) {
        compilation.hooks.afterOptimizeChunks.tap("GlobalizePlugin", afterOptimizeChunksHook);
      } else {
        compilation.plugin("after-optimize-chunks", afterOptimizeChunksHook);
      }

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
      const afterOptimizeModuleIdsHook = () => {
        const globalizeModuleIds = [];
        const globalizeModuleIdsMap = {};

        compilation.chunks.forEach((chunk) => {
          const extractModuleIds = (module) => {
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
          };
          if (compilation.hooks) {
            for (const module of chunk.modulesIterable) {
              extractModuleIds(module);
            }
          } else {
            chunk.forEachModule(extractModuleIds);
          }
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

            const rewriteModule = (module) => {
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
            };

            let newModules;
            if (compilation.hooks) {
              newModules = Array.from(chunk.modulesIterable, (module) => {
                const newModule = rewriteModule(module);

                const createHash = require("webpack/lib/util/createHash");
                const outputOptions = compilation.outputOptions;
                const hashFunction = outputOptions.hashFunction;
                const hashDigest = outputOptions.hashDigest;
                const hashDigestLength = outputOptions.hashDigestLength;
                const newModuleHash = createHash(hashFunction);

                newModule.updateHash(newModuleHash);
                newModule.hash = newModuleHash.digest(hashDigest);
                newModule.renderedHash = newModule.hash.substr(0, hashDigestLength);
                // Essentially set the buildInfo.cacheable
                newModule.build(null, null, null, null, () => {});

                return newModule;
              });
            } else {
              newModules = chunk.mapModules(rewriteModule);
            }

            // remove old modules with modified clones
            // chunk.removeModule doesn't always find the module to remove
            // ¯\_(ツ)_/¯, so we have to be be a bit more thorough here.
            if (compilation.hooks) {
              for (const module of chunk.modulesIterable) {
                module.removeChunk(chunk);
              }
            } else {
              chunk.forEachModule((module) => module.removeChunk(chunk));
            }

            // install the rewritten modules
            chunk.setModules(newModules);
          });
      };

      if (compilation.hooks) {
        compilation.hooks.afterOptimizeModuleIds.tap("GlobalizePlugin", afterOptimizeModuleIdsHook);
      } else {
        compilation.plugin("after-optimize-module-ids", afterOptimizeModuleIdsHook);
      }

      const optimizeChunkOrderHook = (chunks) => {
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
      };

      // Set the right chunks order. The globalize-compiled-data chunks must
      // appear after globalize runtime modules, but before any app code.
      if (compilation.hooks) {
        compilation.hooks.optimizeChunkOrder.tap("GlobalizePlugin", optimizeChunkOrderHook);
      } else {
        compilation.plugin("optimize-chunk-order", optimizeChunkOrderHook);
      }
    };

    if (compiler.hooks) {
      compiler.hooks.thisCompilation.tap("GlobalizePlugin", thisCompilationHook);
    } else {
      compiler.plugin("this-compilation", thisCompilationHook);
    }

    if (compiler.hooks) {
      compiler.hooks.normalModuleFactory.tap("GlobalizePlugin", factory => {
        factory.hooks.parser.for("javascript/auto").tap("GlobalizePlugin", bindParser);
      });
    } else {
      compiler.plugin("compilation", (compilation, params) => {
        params.normalModuleFactory.plugin("parser", bindParser);
      });
    }
  }
}

module.exports = ProductionModePlugin;
