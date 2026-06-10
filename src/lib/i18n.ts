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
      autonomousLearning: 'Autonomous Learning (Exploration)',
      titleMain: 'PW Agentic',
      titleSub: 'Automated SQA Harness',
      workerWs: 'Worker WS:',
      connected: 'Connected',
      disconnected: 'Disconnected',
      workerRam: 'Worker RAM:',
      executionLogs: 'Execution Logs',
      job: 'Job:',
      none: 'None',
      waitingForLogs: 'Waiting for logs...',
      visionEvidence: 'Vision / OCR Evidence',
      noEvidence: 'No evidence captured yet.',
      workerStatus: 'Worker Status:',
      terminalStateEvidence: 'Terminal State Evidence'
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
