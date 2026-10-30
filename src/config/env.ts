import * as dotenv from 'dotenv';

dotenv.config();

export type TargetEnv = 'local-sandbox' | 'docker' | 'live' | 'live-buggy';
export type ChaosMode = 'none' | 'api_500' | 'selector_drift' | 'race_condition' | 'a11y_violation';

export interface EnvironmentConfig {
  targetEnv: TargetEnv;
  baseURL: string;
  apiURL: string;
  userEmail: string;
  userPassword: string;
  chaosMode: ChaosMode;
  useLocalWebServer: boolean;
}

const ENV_MAP: Record<TargetEnv, { baseURL: string; apiURL: string }> = {
  'local-sandbox': {
    baseURL: 'http://127.0.0.1:4201',
    apiURL: 'http://127.0.0.1:4201/api',
  },
  docker: {
    baseURL: 'http://localhost:4200',
    apiURL: 'http://localhost:8091',
  },
  live: {
    baseURL: 'https://practicesoftwaretesting.com',
    apiURL: 'https://api.practicesoftwaretesting.com',
  },
  'live-buggy': {
    baseURL: 'https://with-bugs.practicesoftwaretesting.com',
    apiURL: 'https://api-with-bugs.practicesoftwaretesting.com',
  },
};

export function getEnvConfig(): EnvironmentConfig {
  const targetEnv = (process.env.TARGET_ENV as TargetEnv) || 'local-sandbox';
  const preset = ENV_MAP[targetEnv] || ENV_MAP['local-sandbox'];

  return {
    targetEnv,
    baseURL: process.env.BASE_URL || preset.baseURL,
    apiURL: process.env.API_URL || preset.apiURL,
    userEmail: process.env.TEST_USER_EMAIL || 'customer@practicesoftwaretesting.com',
    userPassword: process.env.TEST_USER_PASSWORD || 'welcome01',
    chaosMode: (process.env.CHAOS_MODE as ChaosMode) || 'none',
    useLocalWebServer: targetEnv === 'local-sandbox' && !process.env.BASE_URL,
  };
}
