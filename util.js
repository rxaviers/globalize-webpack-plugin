var fs = require("fs");

module.exports = {
  readMessages: function(messagesFilepath, locale) {
    messagesFilepath = messagesFilepath.replace("[locale]", locale);
    if (!fs.existsSync(messagesFilepath) || !fs.statSync(messagesFilepath).isFile()) {
      throw new Error("Unable to find messages file: `" + messagesFilepath + "`");
    }
    return JSON.parse(fs.readFileSync(messagesFilepath));
  },

  isGlobalizeModule: function(filepath) {
    filepath = filepath.split( "/" );
    var i = filepath.lastIndexOf("globalize");
    // 1: path should contain "globalize",
    // 2: and it should appear either in the end (e.g., ../globalize) or right
    // before it (e.g., ../globalize/date).
    return i !== -1 /* 1 */ && filepath.length - i <= 2 /* 2 */;
  },

  isGlobalizeRuntimeModule: function(filepath) {
    filepath = filepath.split( "/" );
    var i = filepath.lastIndexOf("globalize-runtime");
    // 1: path should contain "globalize-runtime",
    // 2: and it should appear either in the end (e.g., ../globalize-runtime) or right
    // before it (e.g., ../globalize-runtime/date).
    return i !== -1 /* 1 */ && filepath.length - i <= 2 /* 2 */;
  }
};
