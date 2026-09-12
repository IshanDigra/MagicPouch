/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Warm Editorial / Warm-Tech Craft Palette (Beige / Warm Linen Light & Rich Deep Charcoal Espresso Dark)
        sand: {
          50: '#fdfbf7',   // Cream Linen canvas light
          100: '#f7f3eb',  // Warm Sand background
          200: '#efe6d5',  // Warm Linen card border light
          300: '#e3d4bc',  // Soft Warm Muted
          400: '#cbb396',
          500: '#b08e6b',  // Warm Tan / Ochre accent
          600: '#94704f',
          700: '#775438',
          800: '#5c402b',
          900: '#432f20',
        },
        espresso: {
          50: '#f6f5f3',
          100: '#e7e4df',
          200: '#cecbbf',
          300: '#b0aa9b',
          400: '#8c8473',
          500: '#716857',
          600: '#585042',
          700: '#413a30',   // Deep Charcoal border dark
          800: '#25211b',   // Dark Espresso card surface
          900: '#191612',   // Rich Warm Obsidian canvas dark
          950: '#110e0c',   // Deepest Warm Black
        },
        // Modern Warm Accent Palette
        terracotta: {
          50: '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#e05638', // Warm Rust/Terracotta primary action (Replaces cold red/indigo)
          600: '#c23b20',
          700: '#9a2b16',
        },
        sage: {
          50: '#f4f7f4',
          100: '#e3ebe3',
          400: '#7da47d',
          500: '#527952', // Organic warm green (Done/Success)
          600: '#3d5d3d',
        },
        amberwarm: {
          50: '#fefce8',
          100: '#fef9c3',
          400: '#facc15',
          500: '#d97706', // Warm Ochre/Gold (Urgent/Priority)
          600: '#b45309',
        },
        dark: {
          bg: '#191612',
          card: '#25211b',
          border: '#413a30',
          text: '#f7f3eb',
          muted: '#b0aa9b'
        }
      },
      boxShadow: {
        'warm-soft': '0 4px 20px -2px rgba(67, 47, 32, 0.05), 0 2px 6px -1px rgba(67, 47, 32, 0.03)',
        'warm-card': '0 1px 3px 0 rgba(67, 47, 32, 0.06), 0 1px 2px -1px rgba(67, 47, 32, 0.04)',
        'glow-terracotta': '0 0 24px -4px rgba(224, 86, 56, 0.35)',
        'glow-amber': '0 0 24px -4px rgba(217, 119, 6, 0.35)',
        'dark-card-hover': '0 12px 28px -6px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(239, 230, 213, 0.08)',
      }
    }
  },
  plugins: [],
}
