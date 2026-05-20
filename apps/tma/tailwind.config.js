/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Background palette
        bg: {
          base: 'oklch(14% 0.045 252)',
          card: 'oklch(21% 0.045 252)',
          elevated: 'oklch(27% 0.05 252)',
          border: 'oklch(43% 0.055 252)',
        },
        // Element colors
        earth: {
          DEFAULT: 'oklch(48% 0.105 62)',
          light: 'oklch(58% 0.12 63)',
          dark: 'oklch(35% 0.09 61)',
          glow: 'oklch(48% 0.105 62 / 0.34)',
        },
        fire: {
          DEFAULT: 'oklch(56% 0.19 31)',
          light: 'oklch(66% 0.17 33)',
          dark: 'oklch(42% 0.16 29)',
          glow: 'oklch(56% 0.19 31 / 0.34)',
        },
        water: {
          DEFAULT: 'oklch(58% 0.16 245)',
          light: 'oklch(68% 0.135 238)',
          dark: 'oklch(43% 0.16 252)',
          glow: 'oklch(58% 0.16 245 / 0.34)',
        },
        // Enhanced move gold
        gold: {
          DEFAULT: 'oklch(78% 0.15 83)',
          light: 'oklch(88% 0.12 87)',
          dark: 'oklch(55% 0.13 75)',
          glow: 'oklch(78% 0.15 83 / 0.36)',
        },
        // Energy level colors
        energy: {
          high: 'oklch(57% 0.15 145)',
          mid: 'oklch(72% 0.15 82)',
          low: 'oklch(56% 0.19 31)',
        },
        // Text
        text: {
          primary: 'oklch(94% 0.016 86)',
          secondary: 'oklch(76% 0.026 86)',
          muted: 'oklch(59% 0.035 86)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'card-flip': 'card-flip 0.6s ease-in-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'shake': 'shake 0.5s ease-in-out',
        'energy-fill': 'energy-fill 1s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor, 0 0 10px currentColor' },
          '100%': { boxShadow: '0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'card-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        'energy-fill': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--energy-width)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'game-bg': 'linear-gradient(180deg, oklch(18% 0.05 252), oklch(10% 0.04 252))',
        'earth-gradient': 'linear-gradient(135deg, oklch(58% 0.12 63), oklch(35% 0.09 61))',
        'fire-gradient': 'linear-gradient(135deg, oklch(66% 0.17 33), oklch(42% 0.16 29))',
        'water-gradient': 'linear-gradient(135deg, oklch(68% 0.135 238), oklch(43% 0.16 252))',
        'gold-gradient': 'linear-gradient(135deg, oklch(88% 0.12 87), oklch(55% 0.13 75))',
      },
      boxShadow: {
        'earth': '0 12px 28px oklch(48% 0.105 62 / 0.24)',
        'fire': '0 12px 28px oklch(56% 0.19 31 / 0.24)',
        'water': '0 12px 28px oklch(58% 0.16 245 / 0.24)',
        'gold': '0 12px 28px oklch(78% 0.15 83 / 0.28)',
        'card': '0 18px 38px oklch(5% 0.02 252 / 0.45)',
        'inner-glow': 'inset 0 1px 0 oklch(100% 0 0 / 0.14)',
      },
    },
  },
  plugins: [],
};
