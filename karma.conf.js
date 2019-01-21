module.exports = function(config) {
  config.set({
    frameworks: ['mocha', 'chai'],
    files: ['test/unit/**/*.js'],
    exclude: ['test/unit/debug_mocha.js'],
    reporters: ['spec'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },
    autoWatch: false,
    concurrency: Infinity,
  })
}
