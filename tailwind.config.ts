import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: '#f8fafc',
        primaria: '#0f766e',
        acento: '#f59e0b'
      }
    }
  },
  plugins: []
};

export default config;
