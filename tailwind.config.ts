import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['ABC Diatype', 'system-ui', 'sans-serif'],
        mono: ['ABC Diatype', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        day: {
          bg: 'var(--bg)',
          'bg-secondary': 'var(--bg-secondary)',
          text: 'var(--text)',
          'text-muted': 'var(--text-muted)',
          'text-subtle': 'var(--text-subtle)',
          border: 'var(--border)',
          'border-faint': 'var(--border-faint)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
        },
      },
      borderColor: {
        day: 'var(--border)',
        'day-faint': 'var(--border-faint)',
      },
    },
  },
  plugins: [],
};

export default config;
