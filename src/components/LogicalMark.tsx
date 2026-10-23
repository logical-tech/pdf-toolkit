// The Logical logo, drawn in currentColor so it follows the theme.
export function LogicalMark({ className }: { className?: string }) {
  return (
    <svg viewBox="230 230 740 740" className={className} fill="currentColor" fillRule="evenodd" aria-hidden>
      <path d="M368 230H512V548A139 139 0 0 0 651 687H970V832A138 138 0 0 1 832 970H368A138 138 0 0 1 230 832V368A138 138 0 0 1 368 230ZM287 845A70 70 0 1 0 427 845A70 70 0 1 0 287 845Z" />
      <path d="M651 230H832A138 138 0 0 1 970 368V548H701A50 50 0 0 1 651 498Z" />
    </svg>
  );
}
