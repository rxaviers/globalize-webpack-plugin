var expect = require("chai").expect;
var GlobalizePlugin = require("../index");
var PathChunkPlugin = require("path-chunk-webpack-plugin");
var path = require("path");
var webpack = require("webpack");
var rimraf = require("rimraf");
var fs = require("fs");

var OUTPUT_PATH = path.join(__dirname, "output");

var webpackConfig = {
  entry: {
    app: path.join(__dirname, "fixtures/app")
  },
  output: {
    path: OUTPUT_PATH,
    filename: "app.js"
  },
  plugins: [
    new GlobalizePlugin({
      production: true,
      developmentLocale: "en",
      supportedLocales: ["en"],
      messages: path.join(__dirname, "fixtures/translations/[locale].json"),
      output: "[locale].js"
    }),
    // new webpack.optimize.DedupePlugin(),
    new PathChunkPlugin({
      name: "vendor",
      test: "node_modules/"
    })
  ]
};

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
    describe("Basic app", function() {
      before(function(done) {
        rimraf(OUTPUT_PATH, function() {
          fs.mkdirSync(OUTPUT_PATH);
          done();
        });
      });

      it("should extract formatters and parsers from basic code", function() {
        return expect(promisefiedWebpack(webpackConfig)).to.eventually.be.fulfilled.then(function(stats) {
          var outputFilepath = path.join(OUTPUT_PATH, "en.js");
          var outputFileExists = fs.existsSync(outputFilepath);
          expect(outputFileExists).to.be.true;
          var content = fs.readFileSync(outputFilepath).toString();
          expect(content).to.be.a("string");
        });
      });

      describe("The compiled bundle", function() {
        var Globalize;

        before(function() {
          global.window = global;
          // Hack: Expose __webpack_require__.
          var appFilepath = path.join(__dirname, "./output/app.js");
          var appContent = fs.readFileSync(appFilepath).toString();
          fs.writeFileSync(appFilepath, appContent.replace(/(function __webpack_require__\(moduleId\) {)/, "window.__webpack_require__ = $1"));

          // Hack2: Load compiled Globalize
          require("./output/app");
          require("./output/en");
          Globalize = global.__webpack_require__(1);

          Globalize.locale("en");
        });

        after(function() {
          delete global.window;
          delete global.webpackJsonp;
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
