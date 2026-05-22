function getCandleWickColor(payload) {
  if (payload?.isPeak) {
    return 'rgba(34, 197, 94, 0.34)';
  }

  if (payload?.isLatest) {
    return 'rgba(6, 182, 212, 0.34)';
  }

  return 'rgba(129, 140, 248, 0.28)';
}

export default function TrendCandleBar({ x = 0, y = 0, width = 0, height = 0, fill = '#818cf8', payload = {} }) {
  if (width <= 0) {
    return null;
  }

  const value = typeof payload?.amount === 'number' ? payload.amount : payload?.reward;
  const centerX = x + width / 2;

  if (!value || height <= 0) {
    const flatWidth = Math.max(2, width * 0.34);

    return (
      <rect
        x={centerX - flatWidth / 2}
        y={y - 0.5}
        width={flatWidth}
        height={1.5}
        rx={1}
        fill="rgba(255,255,255,0.12)"
      />
    );
  }

  const candleWidth = Math.max(6, Math.min(width * 0.58, 14));
  const bodyHeight = height >= 12 ? height * 0.82 : height;
  const bodyX = centerX - candleWidth / 2;
  const bodyY = y + (height - bodyHeight) / 2;
  const radius = Math.min(candleWidth / 2, 6);
  const glowWidth = Math.max(2, candleWidth * 0.24);
  const wickColor = getCandleWickColor(payload);

  return (
    <g>
      <line
        x1={centerX}
        x2={centerX}
        y1={y}
        y2={y + height}
        stroke={wickColor}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={candleWidth}
        height={bodyHeight}
        rx={radius}
        fill={fill}
      />
      <rect
        x={centerX - glowWidth / 2}
        y={bodyY + 1}
        width={glowWidth}
        height={Math.max(2, bodyHeight - 2)}
        rx={glowWidth / 2}
        fill="rgba(255,255,255,0.16)"
      />
    </g>
  );
}