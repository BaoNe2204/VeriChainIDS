import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface PricingPlan {
  name: string;
  priceNum: number;
  features: string[];
  popular: boolean;
  billingPeriod: string;
  isEnterprise: boolean;
}

interface PricingCarouselProps {
  plans: PricingPlan[];
  theme: Theme;
  t: any;
  onSelect: () => void;
}

const AUTO_MS = 4000;
const GAP_PX = 32;
const COLS = 3;
const DURATION = 480;

export const PricingCarousel = ({ plans, theme, t, onSelect }: PricingCarouselProps) => {
  const dark = theme === 'dark';
  const total = plans.length;
  const needCarousel = total > COLS;

  const [current, setCurrent] = useState(0);
  const [sliding, setSliding] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cardW, setCardW] = useState(0);
  const [animKey, setAnimKey] = useState(0); // tăng để trigger lại animation

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCard = useCallback((i: number) => plans[((i % total) + total) % total], [plans, total]);

  // Tính card width từ viewport
  const calcCardW = useCallback(() => {
    if (!viewportRef.current) return;
    const vw = viewportRef.current.offsetWidth;
    setCardW((vw - GAP_PX * (COLS - 1)) / COLS);
  }, []);

  useEffect(() => {
    calcCardW();
    const ro = new ResizeObserver(calcCardW);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [calcCardW]);

  // Set track về vị trí mặc định (ghost-prev ở ngoài trái)
  const resetTrack = useCallback(() => {
    if (!trackRef.current || cardW === 0) return;
    const step = cardW + GAP_PX;
    trackRef.current.style.transition = 'none';
    trackRef.current.style.transform = `translateX(${-step}px)`;
  }, [cardW]);

  useEffect(() => { resetTrack(); }, [resetTrack]);

  const slide = useCallback((dir: 'left' | 'right') => {
    if (sliding || !needCarousel || !trackRef.current || cardW === 0) return;
    const step = cardW + GAP_PX;
    setSliding(true);

    const target = dir === 'left' ? -(step * 2) : 0;
    trackRef.current.style.transition = `transform ${DURATION}ms cubic-bezier(0.25,0.46,0.45,0.94)`;
    trackRef.current.style.transform = `translateX(${target}px)`;

    setTimeout(() => {
      setCurrent(prev => dir === 'left'
        ? (prev + 1 + total) % total
        : (prev - 1 + total) % total
      );
      setAnimKey(k => k + 1); // trigger card animation
      setSliding(false);
    }, DURATION + 10);
  }, [sliding, needCarousel, cardW, total]);

  // Auto
  useEffect(() => {
    if (!needCarousel || paused || cardW === 0) return;
    timerRef.current = setInterval(() => slide('left'), AUTO_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [needCarousel, paused, slide, cardW]);

  // 5 cards: ghost-prev, c0, c1, c2, ghost-next
  const track = [
    getCard(current - 1),
    getCard(current),
    getCard(current + 1),
    getCard(current + 2),
    getCard(current + 3),
  ];

  const renderCard = (plan: PricingPlan) => (
    <div className={cn(
      'p-7 rounded-3xl border relative flex flex-col h-full',
      plan.popular
        ? 'bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-600/25'
        : dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
    )}>
      {plan.popular && (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
          Most Popular
        </span>
      )}
      <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
      <div className="flex items-baseline gap-1 mb-6">
        {plan.isEnterprise ? (
          <span className="text-4xl font-black">Custom</span>
        ) : plan.priceNum === 0 ? (
          <span className="text-4xl font-black">Miễn phí</span>
        ) : (
          <>
            <span className="text-4xl font-black">{plan.priceNum.toLocaleString('vi-VN')}</span>
            <span className="text-sm opacity-70 ml-1">
              {t.vnd}/{plan.billingPeriod === 'yearly' ? 'năm' : 'tháng'}
            </span>
          </>
        )}
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feat, j) => (
          <li key={j} className="flex items-center gap-3 text-sm font-medium">
            <Check size={15} className={plan.popular ? 'text-white' : 'text-blue-500'} />
            {feat}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        className={cn(
          'w-full py-3.5 rounded-xl font-bold transition-all',
          plan.popular ? 'bg-white text-blue-600 hover:bg-slate-100' : 'bg-blue-600 text-white hover:bg-blue-500'
        )}
      >
        {t.getStarted}
      </button>
    </div>
  );

  return (
    <section className={cn('py-24 px-6 transition-colors', dark ? 'bg-slate-950/50' : 'bg-slate-100/50')}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className={cn('text-3xl lg:text-5xl font-bold mb-4', dark ? 'text-white' : 'text-slate-900')}>
            {t.pricingTitle}
          </h2>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto">{t.pricingSub}</p>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {needCarousel && (
            <button onClick={() => slide('right')} className={cn(
              'absolute -left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all',
              dark ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            )}>
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Viewport */}
          <div className="overflow-hidden py-8" ref={viewportRef}>
            {needCarousel && cardW > 0 ? (
              /* Track: 5 cards với width cố định tính từ viewport */
              <div
                ref={trackRef}
                className="flex"
                style={{ gap: GAP_PX, willChange: 'transform' }}
              >
                {track.map((plan, i) => (
                  <div
                    key={`${animKey}-${i}`}
                    style={{ width: cardW, flexShrink: 0 }}
                    className="pricing-card-enter"
                    data-delay={i}
                  >
                    {renderCard(plan)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {plans.map((plan, i) => <div key={i}>{renderCard(plan)}</div>)}
              </div>
            )}
          </div>

          {needCarousel && (
            <button onClick={() => slide('left')} className={cn(
              'absolute -right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all',
              dark ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            )}>
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {needCarousel && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="flex items-center gap-2">
              {plans.map((_, i) => (
                <button key={i} onClick={() => { if (!sliding) setCurrent(i); }}
                  className={cn('rounded-full transition-all duration-300',
                    i === current
                      ? 'w-6 h-2 bg-blue-500'
                      : dark ? 'w-2 h-2 bg-slate-600 hover:bg-slate-500' : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                  )}
                />
              ))}
            </div>
            {!paused && (
              <div className={cn('w-24 h-0.5 rounded-full overflow-hidden', dark ? 'bg-slate-800' : 'bg-slate-200')}>
                <div key={`${current}-bar`} className="h-full bg-blue-500 rounded-full"
                  style={{ animation: `pricingBar ${AUTO_MS}ms linear forwards` }} />
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes pricingBar { from{width:0%} to{width:100%} }

        @keyframes cardSlideIn {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }

        /* Chỉ animate card ở vị trí 1,2,3 (3 card hiển thị), ghost 0 và 4 không cần */
        .pricing-card-enter[data-delay="1"] { animation: cardSlideIn 0.42s cubic-bezier(0.34,1.56,0.64,1) 0.00s both; }
        .pricing-card-enter[data-delay="2"] { animation: cardSlideIn 0.42s cubic-bezier(0.34,1.56,0.64,1) 0.07s both; }
        .pricing-card-enter[data-delay="3"] { animation: cardSlideIn 0.42s cubic-bezier(0.34,1.56,0.64,1) 0.14s both; }
      `}</style>
    </section>
  );
};

export default PricingCarousel;
