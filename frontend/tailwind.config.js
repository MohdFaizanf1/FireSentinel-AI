/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        fire: {
          red:    '#FF2D00',
          orange: '#FF6B00',
          amber:  '#FFA500',
          yellow: '#FFD700',
        },
        dark: {
          900: '#080B10',
          800: '#0D1117',
          700: '#111820',
          600: '#162030',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        mono:    ['"Share Tech Mono"', 'monospace'],
        body:    ['Barlow', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in':   'slide-in 0.4s ease',
        'flicker':    'flicker 0.15s ease-in-out infinite alternate',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255,45,0,0.4)' },
          '50%':       { boxShadow: '0 0 40px rgba(255,45,0,0.8)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'flicker': {
          from: { opacity: '1' },
          to:   { opacity: '0.85' },
        },
      },
    },
  },
  plugins: [],
}
