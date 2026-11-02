/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9efff',
          200: '#b9e2ff',
          300: '#83ceff',
          400: '#45b3ff',
          500: '#1185fe',
          600: '#0668dc',
          700: '#0754b2',
          800: '#0b478f',
          900: '#0e3c75',
        },
        skywash: '#f4f9ff',
        ink: '#12233a',
        cloud: '#e8f2fb',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 59, 102, 0.04), 0 10px 30px -18px rgba(16, 59, 102, 0.22)',
        lift: '0 14px 36px -18px rgba(6, 104, 220, 0.5)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Microsoft YaHei"',
          '"PingFang SC"',
          'sans-serif',
        ],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        fadeUp: 'fadeUp 0.35s ease-out both',
        shimmer: 'shimmer 1.8s infinite',
      },
    },
  },
  plugins: [],
};
