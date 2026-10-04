// .cjs because package.json has no "type": "module" — postcss-load-config
// reads this file as CommonJS.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
