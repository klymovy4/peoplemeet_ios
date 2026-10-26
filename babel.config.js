module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // Strip all console.* calls from production builds so the logs
      // do not contain tokens, messages or user coordinates.
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};