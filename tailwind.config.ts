import type { Config } from 'tailwindcss';

/** Brand colours come from the active workspace (Developer → Site → Brand) as CSS variables ("R G B"). */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: v('--brand'),
        brand2: v('--brand-2'),
        accent: v('--accent'),
        bg: v('--bg'),
        surface: v('--surface'),
        ink: v('--ink'),
      },
      fontFamily: {
        head: ['var(--font-head)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '0.6' }, '100%': { transform: 'scale(1.7)', opacity: '0' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        glow: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        fadeUp: 'fadeUp .6s ease-out both',
        glow: 'glow 2.4s ease-in-out infinite',
        marquee: 'marquee 38s linear infinite',
        spinSlow: 'spinSlow 18s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
