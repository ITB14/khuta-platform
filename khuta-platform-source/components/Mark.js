// The rising footstep path. Five steps, the last one gold — the certificate.
export default function Mark({ size = 28, className = '' }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      <path d="M170 150 L26 60" stroke="currentColor" strokeWidth="3" strokeDasharray="1 9"
            strokeLinecap="round" opacity=".5" />
      <circle cx="170" cy="150" r="10" fill="currentColor" />
      <circle cx="134" cy="128" r="11.5" fill="currentColor" />
      <circle cx="98"  cy="106" r="13"   fill="currentColor" />
      <circle cx="62"  cy="84"  r="14.5" fill="currentColor" />
      <circle cx="26"  cy="60"  r="17"   fill="#B68A35" />
    </svg>
  );
}
