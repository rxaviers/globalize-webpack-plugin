"use strict";

const expect = require("chai").expect;
const fs = require("fs");
const GlobalizePlugin = require("../index");
const mkdirp = require("mkdirp");
const path = require("path");
const rimraf = require("rimraf");
const webpack = require("webpack");

const TEST_CASES = {
  /*
    tempdir should be first so that the top-level temp directory
    created for the latter cases doesn't interfere.
  */
  tempdir: [],
  default: [],
  named: [ new webpack.NamedModulesPlugin() ],
  hashed: [ new webpack.HashedModuleIdsPlugin() ]
};

const outputPath = (key, file) => path.join(__dirname, "../_test-output", key, file || "");

const tmpdirBase = (key) => key === "tempdir" ? {tmpdirBase: outputPath(key)} : {};

const mkWebpackConfig = (key) => ({
  entry: {
    app: path.join(__dirname, "fixtures/app")
  },
  output: {
    path: outputPath(key),
    filename: "app.js"
  },
  plugins: TEST_CASES[key].concat([
    new GlobalizePlugin(
      Object.assign(
        {
          production: true,
          developmentLocale: "en",
          supportedLocales: ["en", "es"],
          messages: path.join(__dirname, "fixtures/translations/[locale].json"),
          output: "[locale].js"
        },
        tmpdirBase(key)
      )
    ),
    new webpack.optimize.CommonsChunkPlugin({
      name: "vendor",
      filename: "vendor.js",
      minChunks: (module) => {
        const nodeModules = path.resolve(__dirname, "../node_modules");
        return module.request && module.request.startsWith(nodeModules);
      }
    }),
    new webpack.optimize.CommonsChunkPlugin({
      name: "runtime",
      filename: "runtime.js",
      minChunks: Infinity
    })
  ])
});

const promisefiedWebpack = (config) => new Promise((resolve, reject) => {
  webpack(config, (error, stats) => {
    if (error) {
      return reject(error);
    }
    return resolve(stats);
  });
});

describe("Globalize Webpack Plugin", () => {
  describe("Production Mode", () => {
    Object.keys(TEST_CASES).forEach((key) => {
      describe(`when using ${key} module ids`, () => {
        const webpackConfig = mkWebpackConfig(key);
        const myOutputPath = outputPath(key);
        let compileStats;

        before((done) => {
          rimraf(myOutputPath, () => {
            mkdirp.sync(myOutputPath);
            promisefiedWebpack(webpackConfig)
              .catch(done)
              .then((stats) => {
                compileStats = stats;
                done();
              });
          });
        });

        it("should extract formatters and parsers from basic code", () => {
          const outputFilepath = path.join(myOutputPath, "en.js");
          const outputFileExists = fs.existsSync(outputFilepath);
          expect(outputFileExists).to.be.true;
          const content = fs.readFileSync(outputFilepath).toString();
          expect(content).to.be.a("string");
        });

        describe("The compiled bundle", () => {
          let Globalize;

          before(() => {
            global.window = global;
            // Hack: Expose __webpack_require__.
            const runtimeFilePath = outputPath(key, "runtime.js");
            const runtimeContent = fs.readFileSync(runtimeFilePath).toString();
            fs.writeFileSync(runtimeFilePath, runtimeContent.replace(/(function __webpack_require__\(moduleId\) {)/, "window.__webpack_require__ = $1"));

            // Hack2: Load compiled Globalize
            require(outputPath(key, "runtime"));
            require(outputPath(key, "vendor"));
            require(outputPath(key, "en"));
            require(outputPath(key, "app"));

            const globalizeModuleStats = compileStats.toJson().modules.find((module) => {
              return module.name === "./~/globalize/dist/globalize-runtime.js";
            });

            Globalize = global.__webpack_require__(globalizeModuleStats.id);
          });

          after(() => {
            delete global.window;
            delete global.webpackJsonp;
          });

          it("should render locale chunk with correct entry module", () => {
            const enFilePath = outputPath(key, "en.js");
            const enContent = fs.readFileSync(enFilePath).toString();
            const enChunkLastLine = enContent.split(/\n/).pop();

            const statsJson = compileStats.toJson();
            const compiledDataModuleStats = statsJson.modules.find((module) => {
              return module.source && module.source.match(/Globalize.locale\("en"\); return Globalize;/);
            });

            expect(enChunkLastLine).to.contain(compiledDataModuleStats.id);
          });

          it("should include formatDate", () => {
            const result = Globalize.formatDate(new Date(2017, 3, 15), {datetime: "medium"});
            // Note, the reason for the loose match below is due to ignore the local time zone differences.
            expect(result).to.have.string("Apr");
            expect(result).to.have.string("2017");
          });

          it("should include formatNumber", () => {
            const result = Globalize.formatNumber(Math.PI);
            expect(result).to.equal("3.142");
          });

          it("should include formatCurrency", () => {
            const result = Globalize.formatCurrency(69900, "USD");
            expect(result).to.equal("$69,900.00");
          });

          it("should include formatMessage", () => {
            const result = Globalize.formatMessage("like", 0);
            expect(result).to.equal("Be the first to like this");
          });

          it("should include formatRelativeTime", () => {
            const result = Globalize.formatRelativeTime(1, "second");
            expect(result).to.equal("in 1 second");
          });

          it("should include formatUnit", () => {
            const result = Globalize.formatUnit(60, "mile/hour", {form: "short"});
            expect(result).to.equal("60 mph");
          });

          it("should include parseNumber", () => {
            const result = Globalize.parseNumber("1,234.56");
            expect(result).to.equal(1234.56);
          });

          it("should include parseDate", () => {
            const result = Globalize.parseDate("1/2/1982");
            expect(result.getFullYear()).to.equal(1982);
            expect(result.getMonth()).to.equal(0);
            expect(result.getDate()).to.equal(2);
          });
        });
      });
    });
  });
});
