const paths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2.5 3h2l2.3 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
    </>
  ),
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></>,
  phone: (
    <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a1 1 0 0 1-1 1C10 20 4 14 4 6a1 1 0 0 1 1-1Z" />
  ),
  whatsapp: (
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3Zm4.6 12.4c-.2.5-1.1 1-1.5 1s-1 .1-3-.8a10 10 0 0 1-3.9-4c-.3-.4-1-1.5-1-2.8 0-1.3.7-1.9 1-2.2.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.8 2c.1.2.1.4 0 .6l-.4.6c-.1.2-.2.4 0 .6.3.5.9 1.3 1.8 2 .3.3.6.4.9.2l.5-.5c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.4.1.2.1 1-.1 1.5Z" />
  ),
  star: (
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1Z" />
  ),
  starHalf: (
    <>
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1Z" />
      <path d="M12 2v15.8L5.8 21l1.2-6.9-5-4.9 6.9-1Z" fill="currentColor" stroke="none" />
    </>
  ),
  filter: <path d="M4 5h16M7 12h10M10 19h4" />,
  sort: <path d="M7 6h13M7 12h9M7 18h5M3 6h.01M3 12h.01M3 18h.01" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  truck: (
    <>
      <rect x="1.5" y="6" width="13" height="10" rx="1" />
      <path d="M14.5 10h3.5l3 3.2V16h-6.5z" />
      <circle cx="6" cy="18.5" r="1.7" />
      <circle cx="17" cy="18.5" r="1.7" />
    </>
  ),
  shield: <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5Z" />,
  tag: (
    <>
      <path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7.6-7.6a2 2 0 0 0 0-2.8l-9-9a2 2 0 0 0-1.4-.6Z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  headset: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M19.5 19v.5A3.5 3.5 0 0 1 16 23h-2" />
    </>
  ),
  pin: <><path d="M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22Z" /><circle cx="12" cy="9.5" r="2.3" /></>,
  wrench: (
    <path d="M14.7 6.3a4 4 0 0 0-5.4 4.6L3 17.2 6.8 21l6.3-6.3a4 4 0 0 0 4.6-5.4l-2.8 2.8-2.4-.6-.6-2.4Z" />
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
