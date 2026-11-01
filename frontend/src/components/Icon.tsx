type Props = { name: 'play' | 'pause' | 'stop' | 'mic' | 'settings' | 'link' | 'file' | 'memory'; className?: string }
export default function Icon({ name, className }: Props) {
  const paths = {
    play: <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" />,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    settings: <><path d="m9 3 1-2h4l1 2 3 2 2 1v4l-2 2v3l-2 2-3 1-1 3H9l-1-3-3-2-2-1v-4l2-2V6l2-2Z" /><circle cx="11.5" cy="11" r="3" /></>,
    link: <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
    file: <><path d="M14 2H5v20h14V7ZM14 2v6h5M8 12h8M8 16h6" /></>,
    memory: <><path d="M9 21v-4H6v-4H3l3-5a7 7 0 1 1 13 5v8M10 7l2-2 3 1 1 3-2 3-3-1-1-4ZM12 8h2" /></>,
  }
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
