export function Icon({ name }: { name: 'tickets' | 'logout' | 'attachment' | 'overview' | 'conversation' | 'notes' | 'ai' | 'chevron' }) {
  const paths = {
    tickets: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h10" /></>,
    attachment: <path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8M6 14l8-8" />,
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    conversation: <path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1.5-6A8 8 0 0 1 3 11a9 9 0 0 1 18 0Z" />,
    notes: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2v4m6-4v4M9 11h6m-6 4h4" /></>,
    ai: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
