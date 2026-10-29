// Extends app.json with values that must not be stored in the repository.
// GOOGLE_MAPS_API_KEY is required for the map on Android (Google Maps SDK);
// set in .env locally or as an EAS secret for cloud builds.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
