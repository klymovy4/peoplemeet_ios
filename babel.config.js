module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // В продакшн-сборке полностью вырезаем console.* — чтобы в логах
      // не оставалось токенов, сообщений и координат пользователей.
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};