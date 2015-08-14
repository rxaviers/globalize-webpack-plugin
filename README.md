## Why Globalize Webpack Plugin?

Use *globalize-webpack-plugin* (a) to TBD.

For information about Globalize, please read its [documentation](https://github.com/jquery/globalize#README.md). More specifically, about [Performance](https://github.com/rxaviers/globalize/tree/fix-398-runtime#performance) and [Compilation and the Runtime modules](https://github.com/rxaviers/globalize/tree/fix-398-runtime#compilation-and-the-runtime-modules).

## Usage

    npm install globalize-webpack-plugin --save-dev

```js
new globalizePlugin({
	production: true/false // true: production, false: development
	developmentLocale: "en", // locale to be used for development.
	supportedLocales: [ "en", "es", "zh", ... ], // locales that should be built support for.
	messages: "messages/[locale].json", // messages (optional)
	output: "globalize-compiled-[locale].[hash].js" // build output.
})
```

*production* is a boolean that tells the plugin whether it's on production mode (i.e., to build the precompiled globalize data) or not (i.e., to be in development mode - will use Live AutoReload HRM).

*developmentLocale* tells the plugin which locale to automatically load CLDR for and have it set as default locale for Globalize (i.e., `Globalize.locale(developmentLocale)`).

*supportedLocales* tells the plugin which locales to build/produce compiled-globalize-data for.

*output* is the name scheme of the built files.

## Development

### Tests

    npm install
    npm test
