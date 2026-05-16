const moment = require("moment");

// Obsidian exposes moment globally on window; replicate that for the node test environment
global.window = Object.assign(global.window ?? {}, { moment });
