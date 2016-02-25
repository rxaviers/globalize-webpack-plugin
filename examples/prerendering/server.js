//Lets require/import the HTTP module
var http = require('http');
var fs = require("fs");
var path = require("path");
var _ = require("lodash");
var util = require("util");

//Lets define a port we want to listen to
const PORT=8080; 

var localeFiles = fs.readdirSync("./messages");
var locales = [];
_.each(localeFiles, function(file) {
	if(path.extname(file) === ".json") {
		locales.push(path.basename(file, ".json"));
	}
});

var appPath = path.join(__dirname, "./dist/prerender/app.js");
var prerenderedApp = require(appPath);

//We need a function which handles requests and send response
function handleRequest(request, response){
    var acceptLanguage = request.headers["accept-language"];
    var foundLang = _.filter(locales, function(locale) {
		return locale === acceptLanguage;
	});
	
	var language = foundLang[0];
	var languagePath = path.join(__dirname, "./dist/prerender/i18n/" + language + ".app.js");
	if(!fs.existsSync(languagePath)) {
		console.info(languagePath + " not found, setting to english");
		language = "en";
		languagePath = path.join(__dirname, "./dist/prerender/i18n/en.app.js");
	}
	prerenderedApp(languagePath);
	
	response.end("It Works!! You should see formatted messages in your server console.  Integrate React into your project to get the full power of server side rendering :p");
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});