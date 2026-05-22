import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface Plan {
  name: string;
  priceNum: number;
  features: string[];
  popular: boolean;
  billingPeriod: string;
  isEnterprise: boolean;
}

interface PricingMarqueeProps {
  plans: Plan[];
  theme: Theme;
  t: any;
  onSelect: () => void;
}

export const PricingMarquee = ({ plans, theme, t, onSelect }: PricingMarqueeProps) => {
  const dark = theme === 'dark';
  // Nhân đôi để loop liền mạch
  const doubled = [...plans, ...plans];

  return (
    <section className={cn('py-24 overflow-hidden', dark ? 'bg-slate-950/50' : 'bg-slate-100/50')}>
      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 className={cn('text-3xl lg:text-5xl font-bold mb-4', dark ? 'text-white' : 'text-slate-900')}>
          {t.pricingTitle}
        </h2>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto">{t.pricingSub}</p>
      </div>

      {/* Marquee */}
      <div className="relative">
        {/* Fade edges */}
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-40 z-10 pointer-events-none',
          dark ? 'bg-gradient-to-r from-[#020617] to-transparent' : 'bg-gradient-to-r from-slate-100 to-transparent'
        )} />
        <div className={cn(
          'absolute right-0 top-0 bottom-0 w-40 z-10 pointer-events-none',
          dark ? 'bg-gradient-to-l from-[#020617] to-transparent' : 'bg-gradient-to-l from-slate-100 to-transparent'
        )} />

        {/* Track */}
        <div
          className="pricing-marquee-track flex gap-6 py-8 pl-6"
          style={{ width: 'max-content' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.animationPlayState = 'paused'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.animationPlayState = 'running'}
        >
          {doubled.map((plan, i) => (
            <div
              key={i}
              className={cn(
                'w-72 flex-shrink-0 p-7 rounded-3xl border relative flex flex-col',
                'transition-all duration-300 hover:-translate-y-3 hover:shadow-2xl cursor-pointer',
                plan.popular
                  ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-600/25 scale-[1.03]'
                  : dark
                    ? 'bg-slate-900 border-slate-800 hover:border-blue-500/40 hover:shadow-blue-500/10'
                    : 'bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-blue-100'
              )}
            >
              {plan.popular && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                  ★ Phổ biến nhất
                </span>
              )}

              <h3 className="text-lg font-bold mb-2">{plan.name}</h3>

              <div className="flex items-baseline gap-1 mb-5">
                {plan.isEnterprise ? (
                  <span className="text-3xl font-black">Custom</span>
                ) : plan.priceNum === 0 ? (
                  <span className="text-3xl font-black">Miễn phí</span>
                ) : (
                  <>
                    <span className="text-3xl font-black">{plan.priceNum.toLocaleString('vi-VN')}</span>
                    <span className="text-xs opacity-70 ml-1">
                      {t.vnd}/{plan.billingPeriod === 'yearly' ? 'năm' : 'tháng'}
                    </span>
                  </>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.slice(0, 5).map((feat: string, j: number) => (
                  <li key={j} className="flex items-center gap-2 text-xs font-medium">
                    <Check size={13} className={plan.popular ? 'text-white' : 'text-blue-500'} />
                    {feat}
                  </li>
                ))}
              </ul>

              <button
                onClick={onSelect}
                className={cn(
                  'w-full py-3 rounded-xl font-bold text-sm transition-all',
                  plan.popular
                    ? 'bg-white text-blue-600 hover:bg-slate-100'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                )}
              >
                {t.getStarted}
              </button>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .pricing-marquee-track {
          animation: pricingScroll 35s linear infinite;
        }
        @keyframes pricingScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
};

export default PricingMarquee;
