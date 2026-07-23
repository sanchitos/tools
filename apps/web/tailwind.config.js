/**
 * Tailwind theme = the Stitch "Industrial Integrity" design-token layer.
 * Colors/radii/shadows/type all resolve to the CSS variables defined in
 * src/styles/tokens.css, so a Stitch palette change is a one-file edit there.
 * Components use these semantic utilities (bg-primary, text-ink, rounded-card,
 * shadow-pop, font-display) — never raw hex/px.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '16px', lg: '40px' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)',
          strong: 'var(--color-surface-strong)',
          inverse: 'var(--color-inverse-surface)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
          inverse: 'var(--color-inverse-ink)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
          fg: 'var(--color-primary-fg)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          fg: 'var(--color-accent-fg)',
        },
        neutralStrong: {
          DEFAULT: 'var(--color-neutral-strong)',
          fg: 'var(--color-neutral-strong-fg)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          fg: 'var(--color-error-fg)',
          container: 'var(--color-error-container)',
          onContainer: 'var(--color-error-on-container)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          fg: 'var(--color-success-fg)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          fg: 'var(--color-warning-fg)',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-sans)',
      },
      fontSize: {
        // Stitch type scale (size, { lineHeight, letterSpacing, fontWeight })
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        card: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        hard: 'var(--shadow-hard)',
        pop: 'var(--shadow-pop)',
      },
      ringColor: {
        DEFAULT: 'var(--color-ring)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      spacing: {
        gutter: 'var(--gutter)',
      },
    },
  },
  plugins: [],
};
