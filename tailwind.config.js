/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'neon-black': '#0a0a0a',
        'dark-gray': '#1a1a1a',
        'mid-gray': '#2a2a2a',
        'brand-blue': '#3b82f6',
        'brand-pink': '#ec4899',
        'border-gray': '#404040',
      },
    },
  },
  plugins: [],
};
