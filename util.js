"use strict";

const cldrData = require("cldr-data");
const fs = require("fs");
const path = require("path");

const mainFiles = ["ca-gregorian", "currencies", "dateFields", "numbers", "timeZoneNames", "units"];

const isGlobalizeModule = (filepath) => {
  filepath = filepath.split( /[\/\\]/ );
  const i = filepath.lastIndexOf("globalize");
  // 1: path should contain "globalize",
  // 2: and it should appear either in the end (e.g., ../globalize) or right
  // before it (e.g., ../globalize/date).
  return i !== -1 /* 1 */ && filepath.length - i <= 2 /* 2 */; // eslint-disable-line semi-spacing
};

module.exports = {
  cldr: (locale) => {
    return cldrData.entireSupplemental().concat(mainFiles.map((mainFile) => {
      return cldrData(path.join("main", locale, mainFile));
    }));
  },

  isGlobalizeModule: isGlobalizeModule,

  isGlobalizeRuntimeModule: (filepath) => {
    filepath = filepath.split( /[\/\\]/ );
    const i = filepath.lastIndexOf("globalize-runtime");
    const j = filepath.lastIndexOf("globalize-runtime.js");
    // Either (1 and 2) or (3 and 4):
    // 1: path should contain "globalize-runtime",
    // 2: and it should appear right before it (e.g., ../globalize-runtime/date).
    // 3: path should contain "globalize-runtime.js" file,
    // 4: and it should appear in the end of the filepath.
    return (i !== -1 /* 1 */ && filepath.length - i === 2 /* 2 */) ||
      (j !== -1 /* 3 */ && filepath.length - j === 1 /* 4 */);
  },

  moduleFilterFn: (moduleFilter) => (filepath) => {
    const globalizeModule = isGlobalizeModule(filepath);

    if (moduleFilter) {
      return !(globalizeModule || moduleFilter(filepath));
    } else {
      return !globalizeModule;
    }
  },

  readMessages: (messagesFilepath, locale) => {
    messagesFilepath = messagesFilepath.replace("[locale]", locale);
    if (!fs.existsSync(messagesFilepath) || !fs.statSync(messagesFilepath).isFile()) {
      console.warn("Unable to find messages file: `" + messagesFilepath + "`");
      return null;
    }
    return JSON.parse(fs.readFileSync(messagesFilepath));
  },

  tmpdir: (base) => {
    const tmpdir = path.resolve(base + "/.tmp-globalize-webpack");
    if (!fs.existsSync(tmpdir)) {
      fs.mkdirSync(tmpdir);
    } else {
      if (!fs.statSync(tmpdir).isDirectory()) {
        throw new Error("Unable to create temporary directory: `" + tmpdir + "`");
      }
    }

    return tmpdir;
  },

  escapeRegex: (string) => string.replace(/(?=[\/\\^$*+?.()|{}[\]])/g, "\\")
};
