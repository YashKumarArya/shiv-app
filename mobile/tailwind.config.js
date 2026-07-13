/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe8ff',
          500: '#356ae6',
          600: '#2457d6',
          700: '#1c46b8',
          900: '#102a43',
        },
        canvas: '#f6f0ff',
      },
      boxShadow: {
        sm: '0 3px 8px rgba(16, 42, 67, 0.06)',
        DEFAULT: '0 5px 12px rgba(16, 42, 67, 0.08)',
        md: '0 8px 18px rgba(16, 42, 67, 0.10)',
        lg: '0 12px 24px rgba(16, 42, 67, 0.14)',
        xl: '0 16px 30px rgba(16, 42, 67, 0.17)',
        '2xl': '0 20px 38px rgba(16, 42, 67, 0.20)',
      },
      elevation: {
        sm: 2,
        DEFAULT: 3,
        md: 5,
        lg: 8,
        xl: 10,
        '2xl': 12,
      },
    },
  },
  plugins: [],
};
