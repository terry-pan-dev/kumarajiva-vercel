declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      POSTGRES_URL: string;
      SESSION_SECRET: string;
    }
  }
}

export {};
