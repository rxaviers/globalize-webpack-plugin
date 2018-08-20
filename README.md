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

#### Webpack & Globalize versions

Starting from *v3.0.0*, only *webpack 4* is supported. If you need support for *webpack 3*, use our *v2.x* releases. If you need support for *webpack 2*, use our *v1.x* releases. If you need support for *webpack 1*, use our *v0.x* releases.

| globalize-webpack-plugin | webpack | globalize     |
| ------------------------ | ------- | ------------- |
| 3.x                      | ^4.0.0  | ^1.3.0        |
| 2.x                      | ^3.0.0  | ^1.3.0        |
| 1.1.x                    | ^2.2.0  | ^1.3.0        |
| 1.0.x                    | ^2.2.0  | ^1.1.0 <1.3.0 |
| 0.4.x                    | ^1.9.0  | ^1.3.0        |
| 0.3.x                    | ^1.9.0  | ^1.1.0 <1.3.0 |

## Usage

    npm install globalize-webpack-plugin --save-dev

```js
new globalizePlugin({
	production: true/false, // true: production, false: development
	developmentLocale: "en", // locale to be used for development.
	supportedLocales: [ "en", "es", "zh", ... ], // locales that should be built support for.
	cldr: function() {}, // CLDR data (optional)
	messages: "messages/[locale].json", // messages (optional)
	timeZoneData: function() {}, // time zone data (optional)
	output: "globalize-compiled-data-[locale].[hash].js", // build output.
	moduleFilter: filterFunction, // filter for modules to exclude from processing
	tmpdirBase: ".", // optional for non create-react-apps
})
```

*production* is a boolean that tells the plugin whether it's on production mode (i.e., to build the precompiled globalize data) or not (i.e., to be in development mode - will use Live AutoReload HRM).

*developmentLocale* tells the plugin which locale to automatically load CLDR for and have it set as default locale for Globalize (i.e., `Globalize.locale(developmentLocale)`).

*supportedLocales* tells the plugin which locales to build/produce globalize-compiled-data for.

*cldr* (optional) a *Function* taking one argument: locale, a *String*; returning an *Object* with the CLDR data for the passed locale. Defaults to the entire supplemental data plus the entire main data for the *developmentLocale*. On the development mode, this content is served on runtime. On production mode, this content is used for precompiling the final bundle.

*messages* (optional) a *String* or *Array of Strings* that tells the plugin where to find messages for a certain locale.

*timeZoneData* (optional) a *Function* that returns an *Object* with IANA time zone data. an *Object* with the IANA time zone data. Defaults to the entire IANA time zone data from [iana-tz-data](https://github.com/rxaviers/iana-tz-data) package. On the development mode, this content is served on runtime. On production mode, this content is used for precompiling the final bundle.

*output* is the name scheme of the built files.

*moduleFilter* (optional) is a function to test on filepaths, and optionally reject matching files from further processing. See [react-globalize-webpack-plugin](https://github.com/rxaviers/react-globalize-webpack-plugin) for an example usage. Globalize's internal modules are not processed by default.

*tmpdirBase* tells the plugin where to create its temporary files. It should be set it to `paths.appSrc` in ejected [create-react-app](https://github.com/facebookincubator/create-react-app)s to comply with its ModuleScopePlugin.

## Example

See https://github.com/jquery/globalize/tree/master/examples/app-npm-webpack.

## Development

### Tests

    npm install
    npm test
