/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', "Segoe UI", 'Roboto', "Helvetica Neue", 'Arial', 'sans-serif'],
      },
      colors: {
        dark: {
          bg: '#000000',
          card: '#0a0a0a',
          border: '#27272a',
          text: '#fafafa',
          muted: '#a1a1aa'
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(59, 130, 246, 0.5)'
      }
    }
  },
  plugins: [],
}
