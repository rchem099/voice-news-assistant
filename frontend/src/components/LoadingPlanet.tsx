type Props = { label: string }

export default function LoadingPlanet({ label }: Props) {
  return (
    <div className="loading-planet" role="status" aria-live="polite">
      <svg className="loading-earth" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="#102b49" />
        <path fill="#62c4bd" d="m14 11 8-5 10-2 1 7-6 4-1 6-6 1-2 7-5-3-5-9Zm6 19 7 1 6 7-2 9-6 10-3-9 1-7-5-5Zm16-18 7-5 8 6-1 5 7 7-3 6-9-2-3-6-7 1-5-5Zm0 15 8 2 5 9-5 11-6-1-4-10Zm12 19 9-4 2 7-7 5-5-3Z" />
        <circle cx="32" cy="32" r="29" fill="none" stroke="#167e89" strokeWidth="1.5" />
      </svg>
      <span>{label}<span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span><span className="sr-only">. Please wait.</span></span>
    </div>
  )
}
