"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

const COIN = 22;

/**
 * Ba đồng xu bay theo đường cong từ nút faucet về icon số dư, rồi icon "nảy" khi xu chạm.
 * Chỉ animate transform (Web Animations API). Đặt trong phần tử `relative` là `container`.
 */
export function CoinDrop({
  container,
  from,
  to,
  onDone,
}: {
  container: RefObject<HTMLElement | null>;
  from: RefObject<HTMLElement | null>;
  to: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const coins = useRef<(HTMLSpanElement | null)[]>([]);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const c = container.current;
    const a = from.current;
    const b = to.current;
    const els = coins.current.filter((x): x is HTMLSpanElement => Boolean(x));
    if (!c || !a || !b || els.length === 0) {
      done.current();
      return;
    }
    const cr = c.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const x0 = ar.left + ar.width / 2 - cr.left - COIN / 2;
    const y0 = ar.top + ar.height / 2 - cr.top - COIN / 2;
    const x1 = br.left + br.width / 2 - cr.left - COIN / 2;
    const y1 = br.top + br.height / 2 - cr.top - COIN / 2;
    const peak = Math.min(y0, y1) - 58;
    const anims = els.map((el, i) =>
      el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(.6)` },
          { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) scale(1.1)`, offset: 0.45 },
          { transform: `translate(${x1}px, ${y1}px) scale(.45)` },
        ],
        { duration: 950, delay: i * 120, easing: "cubic-bezier(.45,0,.3,1)", fill: "both" },
      ),
    );
    const land = b.animate(
      [{ transform: "none" }, { transform: "scale(1.18)", offset: 0.6 }, { transform: "none" }],
      { duration: 520, delay: 820, easing: "cubic-bezier(.34,1.56,.64,1)" },
    );
    let alive = true;
    Promise.all(anims.map((x) => x.finished))
      .then(() => alive && done.current())
      .catch(() => undefined);
    return () => {
      alive = false;
      for (const x of anims) x.cancel();
      land.cancel();
    };
  }, [container, from, to]);

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          ref={(el) => {
            coins.current[i] = el;
          }}
          className="absolute left-0 top-0 rounded-full bg-[var(--accent)] shadow-[inset_0_0_0_3px_var(--red-ink)]"
          style={{ width: COIN, height: COIN, transform: "translate(-200vw, 0)" }}
        />
      ))}
    </span>
  );
}
