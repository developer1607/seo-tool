import {
  pctChange,
  trendArrow,
  trendClass,
  trendKind,
} from "../../lib/format";

type Props = {
  cur: number;
  prev: number;
  /** Precomputed label like "+12.3%" — if omitted, computed from cur/prev */
  label?: string;
};

export default function TrendBadge({ cur, prev, label }: Props) {
  const kind = trendKind(cur, prev);
  const text = label ?? pctChange(cur, prev);
  return (
    <span className={trendClass(kind)}>
      {trendArrow(kind)} {text}
    </span>
  );
}
