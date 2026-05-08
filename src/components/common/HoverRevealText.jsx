export default function HoverRevealText({
  as: Component = 'span',
  text,
  className = '',
  wrapperClassName = '',
  tooltipClassName = '',
}) {
  if (!text) return null;

  return (
    <div className={`group relative min-w-0 max-w-full ${wrapperClassName}`}>
      <Component title={text} className={className}>
        {text}
      </Component>
      <div className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden max-w-[min(28rem,calc(100vw-2rem))] group-hover:block">
        <div
          className={`rounded-xl border border-white/[0.12] bg-[rgba(12,12,30,0.96)] px-3 py-2 text-xs text-white/85 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl whitespace-normal break-words ${tooltipClassName}`}
        >
          {text}
        </div>
      </div>
    </div>
  );
}