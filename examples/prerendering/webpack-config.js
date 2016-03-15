var webpack = require( "webpack" );
var CommonsChunkPlugin = require( "webpack/lib/optimize/CommonsChunkPlugin" );
var HtmlWebpackPlugin = require( "html-webpack-plugin" );
var GlobalizePlugin = require( "globalize-webpack-plugin" );
var nopt = require( "nopt" );

var options = nopt({
	production: Boolean
});

module.exports = [];
module.exports.push(entry(options));

if(options.production) {
	options.prerender = true;
	module.exports.push(entry(options));
}

function entry(options) {
	
	var entry = {
		main: "./app/index.js",
	};
	
	if(!options.prerender && options.production) {
		entry["vendor"] = [
   			"globalize",
			"globalize/dist/globalize-runtime/number",
			"globalize/dist/globalize-runtime/currency",
			"globalize/dist/globalize-runtime/date",
			"globalize/dist/globalize-runtime/message",
			"globalize/dist/globalize-runtime/plural",
			"globalize/dist/globalize-runtime/relative-time",
			"globalize/dist/globalize-runtime/unit"
		];
	}
	
	var plugins = [
		new HtmlWebpackPlugin({
			production: options.production,
			template: "./index-template.html"
		}),
		new GlobalizePlugin({
			production: options.production,
			developmentLocale: "en",
			supportedLocales: [ "ar", "de", "en", "es", "pt", "ru", "zh" ],
			messages: "messages/[locale].json",
			output: "i18n/[locale].app." + (!options.prerender ? "[hash].js" : "js")
		})
	];
	
	if(options.prerender) {
		plugins.push(new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }));
	} else if(options.production) {
		plugins.push(
			new webpack.optimize.DedupePlugin(),
			new CommonsChunkPlugin( "vendor", "vendor.[hash].js" ),
			new webpack.optimize.UglifyJsPlugin({
				compress: {
					warnings: false
				}
			})
		);
	}
	
	return {
		entry: entry,
		target: options.prerender ? "node" : "web",
		debug: !options.production,
		output: {
			path: options.production ? (options.prerender ? "./dist/prerender" : "./dist/public") : "./tmp",
			publicPath: options.production ? "" : "http://localhost:8080/",
			filename: options.production ? (options.prerender ? "app.js" : "app.[hash].js") : "app.js",
			libraryTarget: options.prerender ? "commonjs2" : undefined,
		},
		resolve: {
			extensions: [ "", ".js" ]
		},
		plugins: plugins
	};
};
