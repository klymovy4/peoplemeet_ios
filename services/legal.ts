import * as WebBrowser from 'expo-web-browser';

// Public pages of the web app (also used in the App Store / Google Play listings)
const SITE_URL = 'https://peoplemeet.com.ua';

export const LEGAL_URLS = {
  privacy: `${SITE_URL}/privacy`,
  terms: `${SITE_URL}/terms`,
  deleteAccount: `${SITE_URL}/delete-account`,
} as const;

/** Opens a legal page in an in-app browser */
export const openLegalPage = (page: keyof typeof LEGAL_URLS) => {
  WebBrowser.openBrowserAsync(LEGAL_URLS[page]).catch((error) => {
    console.error('Failed to open legal page:', error);
  });
};
