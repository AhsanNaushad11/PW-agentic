import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      config: 'Configuration',
      targetUrl: 'Target URL',
      executionMode: 'Execution Mode',
      totalRounds: 'Total Rounds',
      enqueueJob: 'Enqueue Job',
      queuing: 'Queuing...',
      fixtureDriven: 'Fixture Driven (Math Matrix)',
      autonomousLearning: 'Autonomous Learning (Exploration)'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
