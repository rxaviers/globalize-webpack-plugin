## Why Globalize Webpack Plugin?

Use *globalize-webpack-plugin* if your application uses [Globalize][] for internationalization/localization. For information about Globalize, please read its [documentation](https://github.com/jquery/globalize#README.md). More specifically, about [Performance](https://github.com/rxaviers/globalize/tree/fix-398-runtime#performance) and [Compilation and the Runtime modules](https://github.com/rxaviers/globalize/tree/fix-398-runtime#compilation-and-the-runtime-modules).

[Globalize]: https://github.com/jquery/globalize

### Goal

#### Development
- **Easy development**, Globalize is a powerful and flexible library, but it can be frustrating to set it up (e.g., loading required CLDR data on development, using compiled data instead on production). It should be easy for developers to build apps using Globalize. This plugin allows developers to use Globalize (declaratively) without worrying about any of these setups.
- **Fast Live Reload**, Webpack allows for easier development through its live reload plugin (HMR Hot Module Replacement), which is a very powerful tool. But, it's frustrating when the pre-processing takes too much time and doesn't get responsive. This plugin optimizes Globalize updates on development by not performing any precompilation during development. Instead, it allows Globalize to generate the formatters and parsers dynamically by feeding it on all the necessary CLDR data. To sum up, on development the boot time is increased, but each update is really quick.

#### Production

- **Optimized for Production**,
  - Small. Avoid including unnecessary i18n data. For example, doesn't include unnecessary translation messages, doesn't include unnecessary functionality data (e.g., doesn't include calendar information if not formatting dates, doesn't include currency data if not formatting currencies, etc), doesn't include unnecessary data within the same functionality (e.g., doesn't include month names if formatting dates using numbered months only). Thefore, no bandwidth is wasted.
  - Fast. Have all formatters (numbers, currencies, datetimes, relative time) generated/preprocessed at built time. This is, traversing CLDR data and generating the formatters will happen during build time and will be precompiled for runtime. Therefore, no CPU clocks are wasted on the client.
- **Globalize-compiled-data in separate chunks**, allow grouping globalize-compiled code in separate chunks.

### Restrictions

#### Production

**Globalize-compiled-data in separate chunks** is a feature. But, it's also a restriction. In order to use this plugin, you must split your code in at least three chunks: vendor libraries (including globalize), the automatically generated globalize-compiled chunks, and your application code.

## Usage

    npm install globalize-webpack-plugin --save-dev

```js
new globalizePlugin({
	production: true/false // true: production, false: development
	developmentLocale: "en", // locale to be used for development.
	supportedLocales: [ "en", "es", "zh", ... ], // locales that should be built support for.
	messages: "messages/[locale].json", // messages (optional)
	output: "globalize-compiled-data-[locale].[hash].js" // build output.
})
```

*production* is a boolean that tells the plugin whether it's on production mode (i.e., to build the precompiled globalize data) or not (i.e., to be in development mode - will use Live AutoReload HRM).

*developmentLocale* tells the plugin which locale to automatically load CLDR for and have it set as default locale for Globalize (i.e., `Globalize.locale(developmentLocale)`).

*supportedLocales* tells the plugin which locales to build/produce globalize-compiled-data for.

*messages* tells the plugin where to find messages for a certain locale.

*output* is the name scheme of the built files.

## Example

See https://github.com/jquery/globalize/tree/master/examples/app-npm-webpack.

## Development

### Tests

    npm install
    npm test
