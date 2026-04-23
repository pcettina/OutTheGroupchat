/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'var(--font-poppins)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // OTG "Last Call" palette — brand/palette.json
        // Source of truth: docs/design/DESIGN_BRIEF.md §3 (locked 2026-04-22)
        otg: {
          sodium: {
            DEFAULT: '#FF6B4A',
            50:  '#FFF1EC',
            100: '#FFDCD0',
            200: '#FFBBA5',
            300: '#FF977A',
            400: '#FF8261',
            500: '#FF6B4A',
            600: '#E8502F',
            700: '#B93B1F',
            800: '#862914',
            900: '#5C1C0E',
            950: '#3A1107',
          },
          bourbon: {
            DEFAULT: '#FFB347',
            50:  '#FFF7EC',
            100: '#FFE9C8',
            200: '#FFD28F',
            300: '#FFC169',
            400: '#FFB347',
            500: '#FFB347',
            600: '#E0932B',
            700: '#B6741C',
            800: '#855313',
            900: '#5C3A0D',
          },
          brick: '#7A2C1A',
          tile: {
            DEFAULT: '#5FB3A8',
            50:  '#F0F8F7',
            100: '#DCEFEC',
            200: '#B7DED8',
            300: '#8AC9BF',
            400: '#6DBCB1',
            500: '#5FB3A8',
            600: '#478880',
            700: '#34665F',
            800: '#264C46',
            900: '#1C3835',
          },
          maraschino: '#3A1F2B',
          bg: {
            dark: '#15110E',
            light: '#FAF3E7',
          },
          text: {
            bright: '#F5EBDD',
            dim: '#8B7E6F',
          },
          border: '#2B221C',
          danger: '#D04A3C',
        },
        // Legacy (pre-pivot "warm sunset") — retained for non-breaking migration.
        // TODO: remove once /design-component pass replaces emerald utilities site-wide.
        primary: {
          DEFAULT: '#10b981',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        card: 'rgb(var(--color-card) / <alpha-value>)',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow-emerald': '0 0 30px rgba(16, 185, 129, 0.3)',
        'glow-amber': '0 0 30px rgba(245, 158, 11, 0.3)',
      },
    },
  },
  plugins: [],
};
