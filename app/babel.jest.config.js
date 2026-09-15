// Deliberately separate from a project-root babel.config.js, which Metro
// would also pick up for bundling the real app — this file only exists to
// let Jest transform the crypto module's ESM import/export syntax to
// CommonJS for tests that run under plain Node, not through Metro at all.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
