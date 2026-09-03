/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#A855F7',
          indigo: '#6366F1',
          green: '#10B981',
          orange: '#F59E0B',
          red: '#EF4444',
          blue: '#3B82F6',
        },
      },
      backgroundImage: {
        'dark-gradient': 'linear-gradient(135deg, hsl(230,40%,8%) 0%, hsl(240,35%,12%) 100%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 8px rgba(16,185,129,0.6)' },
          '50%': { opacity: '0.7', boxShadow: '0 0 16px rgba(16,185,129,0.8)' },
        },
      },
    },
  },
  plugins: [],
};
