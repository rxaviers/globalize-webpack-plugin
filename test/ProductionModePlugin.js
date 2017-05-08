var expect = require("chai").expect;
var fs = require("fs");
var GlobalizePlugin = require("../index");
var mkdirp = require("mkdirp");
var path = require("path");
var rimraf = require("rimraf");
var webpack = require("webpack");

var TEST_CASES = {
  default: [],
  named: [ new webpack.NamedModulesPlugin() ],
  hashed: [ new webpack.HashedModuleIdsPlugin() ]
};

function outputPath(key, file) {
  return path.join(__dirname, "../_test-output", key, file || "");
}

function mkWebpackConfig(key) {
  return {
    entry: {
      app: path.join(__dirname, "fixtures/app")
    },
    output: {
      path: outputPath(key),
      filename: "app.js"
    },
    plugins: TEST_CASES[key].concat([
      new GlobalizePlugin({
        production: true,
        developmentLocale: "en",
        supportedLocales: ["en", "es"],
        messages: path.join(__dirname, "fixtures/translations/[locale].json"),
        output: "[locale].js"
      }),
      new webpack.optimize.CommonsChunkPlugin({
        name: "vendor",
        filename: "vendor.js",
        minChunks: function(module) {
          var nodeModules = path.resolve(__dirname, "../node_modules");
          return module.request && module.request.startsWith(nodeModules);
        }
      }),
      new webpack.optimize.CommonsChunkPlugin({
        name: "runtime",
        filename: "runtime.js",
        minChunks: Infinity
      })
    ])
  };
}

function promisefiedWebpack(config) {
  return new Promise(function(resolve, reject) {
    webpack(config, function(error, stats) {
      if (error) {
        return reject(error);
      }
      return resolve(stats);
    });
  });
}

describe("Globalize Webpack Plugin", function() {
  describe("Production Mode", function() {
    Object.keys(TEST_CASES).forEach(function(key) {
      describe(`when using ${key} module ids`, function() {
        var webpackConfig = mkWebpackConfig(key);
        var myOutputPath = outputPath(key);
        var compileStats;

        before(function(done) {
          rimraf(myOutputPath, function() {
            mkdirp.sync(myOutputPath);
            promisefiedWebpack(webpackConfig)
              .catch(done)
              .then(function (stats) {
                compileStats = stats;
                done();
              });
          });
        });

        it("should extract formatters and parsers from basic code", function() {
          var outputFilepath = path.join(myOutputPath, "en.js");
          var outputFileExists = fs.existsSync(outputFilepath);
          expect(outputFileExists).to.be.true;
          var content = fs.readFileSync(outputFilepath).toString();
          expect(content).to.be.a("string");
        });

        describe("The compiled bundle", function() {
          var Globalize;

          before(function() {
            global.window = global;
            // Hack: Expose __webpack_require__.
            var runtimeFilePath = outputPath(key, "runtime.js");
            var runtimeContent = fs.readFileSync(runtimeFilePath).toString();
            fs.writeFileSync(runtimeFilePath, runtimeContent.replace(/(function __webpack_require__\(moduleId\) {)/, "window.__webpack_require__ = $1"));

            // Hack2: Load compiled Globalize
            require(outputPath(key, "runtime"));
            require(outputPath(key, "vendor"));
            require(outputPath(key, "en"));
            require(outputPath(key, "app"));

            var globalizeModuleStats = compileStats.toJson().modules.find(function (module) {
              return module.name === "./~/globalize/dist/globalize-runtime.js";
            });

            Globalize = global.__webpack_require__(globalizeModuleStats.id);
          });

          after(function() {
            delete global.window;
            delete global.webpackJsonp;
          });

          it("should render locale chunk with correct entry module", function() {
            var enFilePath = outputPath(key, "en.js");
            var enContent = fs.readFileSync(enFilePath).toString();
            var enChunkLastLine = enContent.split(/\n/).pop();

            var statsJson = compileStats.toJson();
            var compiledDataModuleStats = statsJson.modules.find(function (module) {
              return module.source && module.source.match(/Globalize.locale\("en"\); return Globalize;/);
            });

            expect(enChunkLastLine).to.contain(compiledDataModuleStats.id);
          });

          it("should include formatDate", function() {
            var result = Globalize.formatDate(new Date(2017, 3, 15), {datetime: "medium"});
            // Note, the reason for the loose match below is due to ignore the local time zone differences.
            expect(result).to.have.string("Apr");
            expect(result).to.have.string("2017");
          });

          it("should include formatNumber", function() {
            var result = Globalize.formatNumber(Math.PI);
            expect(result).to.equal("3.142");
          });

          it("should include formatCurrency", function() {
            var result = Globalize.formatCurrency(69900, "USD");
            expect(result).to.equal("$69,900.00");
          });

          it("should include formatMessage", function() {
            var result = Globalize.formatMessage("like", 0);
            expect(result).to.equal("Be the first to like this");
          });

          it("should include formatRelativeTime", function() {
            var result = Globalize.formatRelativeTime(1, "second");
            expect(result).to.equal("in 1 second");
          });

          it("should include formatUnit", function() {
            var result = Globalize.formatUnit(60, "mile/hour", {form: "short"});
            expect(result).to.equal("60 mph");
          });

          it("should include parseNumber", function() {
            var result = Globalize.parseNumber("1,234.56");
            expect(result).to.equal(1234.56);
          });

          it("should include parseDate", function() {
            var result = Globalize.parseDate("1/2/1982");
            expect(result.getFullYear()).to.equal(1982);
            expect(result.getMonth()).to.equal(0);
            expect(result.getDate()).to.equal(2);
          });
        });
      });
    });
  });
});
