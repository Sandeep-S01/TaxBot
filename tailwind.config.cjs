const forms = require('@tailwindcss/forms');
const typography = require('@tailwindcss/typography');

module.exports = {
  content: [
    './public/*.html',
    './public/js/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-teal-500) / <alpha-value>)',
        'background-light': 'rgb(var(--color-mist-50) / <alpha-value>)',
        'background-dark': 'rgb(var(--color-night-950) / <alpha-value>)',
        'card-dark': 'rgb(var(--color-night-900) / <alpha-value>)',
        'border-dark': 'rgb(var(--color-night-700) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-ink-600) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      letterSpacing: {
        tighter: '0em',
        tight: '0em',
        normal: '0em',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
      },
    },
  },
  plugins: [forms, typography],
};
