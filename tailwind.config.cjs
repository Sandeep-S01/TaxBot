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
        paper: {
          DEFAULT: '#F3EEDF',
          dim: '#EAE3CD',
        },
        'paper-dim': '#EAE3CD',
        ink: {
          DEFAULT: '#232A24',
          soft: '#5B6459',
        },
        'ink-soft': '#5B6459',
        rule: '#CBBFA0',
        stamp: {
          DEFAULT: '#B23A2E',
          tint: 'rgba(178, 58, 46, 0.1)',
        },
        sage: '#4B6350',
      },
      fontFamily: {
        heading: ['Bricolage Grotesque', 'sans-serif'],
        display: ['Bricolage Grotesque', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        'nav-label': '14px',
        'data-label': '12px',
      },
      spacing: {
        'sidebar-expanded': '240px',
        'sidebar-collapsed': '64px',
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
