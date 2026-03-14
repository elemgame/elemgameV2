/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Background palette
        bg: {
          base: '#0a0a1a',
          card: '#161b22',
          elevated: '#1c2333',
          border: '#30363d',
        },
        // Element colors
        earth: {
          DEFAULT: '#8b4513',
          light: '#a0522d',
          dark: '#5c2e0a',
          glow: 'rgba(139,69,19,0.4)',
        },
        fire: {
          DEFAULT: '#ef4444',
          light: '#f87171',
          dark: '#b91c1c',
          glow: 'rgba(239,68,68,0.4)',
        },
        water: {
          DEFAULT: '#3b82f6',
          light: '#60a5fa',
          dark: '#1d4ed8',
          glow: 'rgba(59,130,246,0.4)',
        },
        // Enhanced move gold
        gold: {
          DEFAULT: '#ffd700',
          light: '#ffe44d',
          dark: '#cc9900',
          glow: 'rgba(255,215,0,0.4)',
        },
        // Energy level colors
        energy: {
          high: '#22c55e',
          mid: '#eab308',
          low: '#ef4444',
        },
        // Text
        text: {
          primary: '#f0f6fc',
          secondary: '#8b949e',
          muted: '#484f58',
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
        'game-bg': 'radial-gradient(ellipse at top, #1a1a3e 0%, #0a0a1a 70%)',
        'earth-gradient': 'linear-gradient(135deg, #8b4513, #5c2e0a)',
        'fire-gradient': 'linear-gradient(135deg, #ef4444, #b91c1c)',
        'water-gradient': 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        'gold-gradient': 'linear-gradient(135deg, #ffd700, #cc9900)',
      },
      boxShadow: {
        'earth': '0 0 20px rgba(139,69,19,0.5)',
        'fire': '0 0 20px rgba(239,68,68,0.5)',
        'water': '0 0 20px rgba(59,130,246,0.5)',
        'gold': '0 0 20px rgba(255,215,0,0.5)',
        'card': '0 4px 16px rgba(0,0,0,0.4)',
        'inner-glow': 'inset 0 0 10px rgba(255,255,255,0.05)',
      },
    },
  },
  plugins: [],
};
