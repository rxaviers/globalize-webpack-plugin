"use strict";

const expect = require("chai").expect;
const fs = require("fs");
const GlobalizePlugin = require("../index");
const mkdirp = require("mkdirp");
const path = require("path");
const rimraf = require("rimraf");
const webpack = require("webpack");

const supportedLocales = ["en", "es"];

const mkOutputPath = (testName, file) => path.join(__dirname, "../_test-output", testName, file || "");

const mkWebpackConfig = (options) => ({
  entry: {
    app: path.join(__dirname, "fixtures/app")
  },
  output: {
    path: options.outputPath,
    filename: "app.js"
  },
  plugins: [
    new GlobalizePlugin(
      Object.assign(
        {
          production: true,
          developmentLocale: "en",
          supportedLocales: supportedLocales,
          messages: [path.join(__dirname, "fixtures/translations/[locale].json"),
            path.join(__dirname, "fixtures/more-translations/[locale].json")],
          output: "[locale].js"
        },
        options.additionalGWPAttributes
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
  ].concat(options.additionalPlugins || [])
});

const promisefiedWebpack = (config) => new Promise((resolve, reject) => {
  webpack(config, (error, stats) => {
    if (error) {
      return reject(error);
    }
    return resolve(stats);
  });
});

function commonTests(testName, webpackConfig, outputPath) {
  let Globalize;
  let GlobalizeWebpackId;
  let compileStats;

  before((done) => {
    rimraf(outputPath, () => {
      mkdirp.sync(outputPath);
      promisefiedWebpack(webpackConfig)
        .then((stats) => {
          compileStats = stats;

          global.window = global;
          // Hack: Expose __webpack_require__.
          const runtimeFilePath = mkOutputPath(testName, "runtime.js");
          const runtimeContent = fs.readFileSync(runtimeFilePath).toString();
          fs.writeFileSync(runtimeFilePath, runtimeContent.replace(/(function __webpack_require__\(moduleId\) {)/, "window.__webpack_require__ = $1"));

          // Hack2: Load compiled Globalize
          require(mkOutputPath(testName, "runtime"));
          require(mkOutputPath(testName, "vendor"));
          require(mkOutputPath(testName, "en"));
          require(mkOutputPath(testName, "app"));

          const globalizeModuleStats = compileStats.toJson().modules.find((module) => {
            return module.name === "./node_modules/globalize/dist/globalize-runtime.js";
          });

          GlobalizeWebpackId = globalizeModuleStats.id;
          Globalize = global.__webpack_require__(GlobalizeWebpackId);

          done();
        })
        .catch(done);
    });
  });

  after(() => {
    delete global.window;
    delete global.webpackJsonp;
  });

  it("should extract formatters and parsers from basic code", () => {
    const outputFilepath = path.join(outputPath, "en.js");
    const outputFileExists = fs.existsSync(outputFilepath);
    expect(outputFileExists).to.be.true;
    const content = fs.readFileSync(outputFilepath).toString();
    expect(content).to.be.a("string");
  });

  it("should transform app's imports from globalize into globalize-runtime", () => {
    const appFilePath = mkOutputPath(testName, "app.js");
    const appContent = fs.readFileSync(appFilePath).toString();

    expect(appContent).to.contain(`const Globalize = __webpack_require__( ${JSON.stringify(GlobalizeWebpackId)} );`);
  });

  describe("The compiled bundle", () => {
    it("should render locale chunk with correct entry module", () => {
      const enFilePath = mkOutputPath(testName, "en.js");
      const enContent = fs.readFileSync(enFilePath).toString();
      const enChunkLastLine = enContent.split(/\n/).pop();

      const statsJson = compileStats.toJson();
      const compiledDataModuleStats = statsJson.modules.find((module) => {
        return module.source && module.source.match(/Globalize.locale\("en"\); return Globalize;/);
      });

      expect(enChunkLastLine).to.contain(compiledDataModuleStats.id);
    });

    it("should have as many globalize-runtime-data modules as supported locales", () => {
      const statsJson = compileStats.toJson();
      const dataModulesCount = statsJson.modules.reduce((total, module) => {
        return module.name.startsWith("./.tmp-globalize-webpack/") ? total+1 : total;
      }, 0);

      expect(dataModulesCount).to.equal(supportedLocales.length);
    });

    it("should include formatDate", () => {
      const result = Globalize.formatDate(new Date(2017, 3, 15), {datetime: "medium"});
      // Note, the reason for the loose match below is due to ignore the local time zone differences.
      expect(result).to.have.string("Apr");
      expect(result).to.have.string("2017");
    });

    it("should include support for formatDate with timeZone support", () => {
      const result = Globalize.formatDate(new Date("2017-04-15T12:00:00Z"), {
        datetime: "full",
        timeZone: "America/Sao_Paulo"
      });
      expect(result).to.equal("Saturday, April 15, 2017 at 9:00:00 AM Brasilia Standard Time");
    });

    it("should include support for formatDateToParts", () => {
      const result = Globalize.formatDateToParts(new Date(2017, 3, 15), {date: "long"});
      expect(result).to.include({type: "month", value: "April"});
      expect(result).to.include({type: "year", value: "2017"});
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

    it("should include strings defined in all locale files", function() {
      const result = Globalize.formatMessage("foo");
      expect(result).to.equal("bar");
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

    it("should include support for parseDate with timeZone support", function() {
      const result = Globalize.parseDate("January 1, 2000 at 12:00:00 AM EST", {
        datetime: "long",
        timeZone: "America/New_York"
      });
      expect(result).to.deep.equal(new Date("2000-01-01T05:00:00Z"));
    });
  });
}

describe("Globalize Webpack Plugin", () => {
  describe("Production Mode", () => {

    // tempdir should be first so that the top-level temp directory
    // created for the latter cases doesn't interfere.
    describe("Custom tempdir", () => {
      const outputPath = mkOutputPath("tempdir");
      const webpackConfig = mkWebpackConfig({
        additionalGWPAttributes: {
          tempdirBase: mkOutputPath("tempdir")
        },
        outputPath
      });
      commonTests("tempdir", webpackConfig, outputPath);
    });

    describe("Default module ids", () => {
      const outputPath = mkOutputPath("default");
      const webpackConfig = mkWebpackConfig({outputPath});
      commonTests("default", webpackConfig, outputPath);
    });

    describe("Named module ids", () => {
      const outputPath = mkOutputPath("named");
      const webpackConfig = mkWebpackConfig({
        additionalPlugins: [new webpack.NamedModulesPlugin()],
        outputPath
      });
      commonTests("named", webpackConfig, outputPath);
    });

    describe("Hashed module ids", () => {
      const outputPath = mkOutputPath("hashed");
      const webpackConfig = mkWebpackConfig({
        additionalPlugins: [new webpack.HashedModuleIdsPlugin()],
        outputPath
      });
      commonTests("hashed", webpackConfig, outputPath);
    });
  });
});
