const forms = require('@tailwindcss/forms');
const typography = require('@tailwindcss/typography');

module.exports = {
  content: [
    './public/*.html',
    './public/js/*.js',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F3EEDF',
        'paper-dim': '#EAE3CD',
        ink: '#232A24',
        'ink-soft': '#5B6459',
        rule: '#CBBFA0',
        stamp: '#B23A2E',
        sage: '#4B6350',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
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
