import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Shield, Activity, Bot, Zap, ShieldCheck, Cloud,
  Network, Lock, User, Server, Check,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, Language } from '../types';
import { PricingPlansApi } from '../services/api';
import { PricingCarousel } from './PricingCarousel';

// ── Floating particle ────────────────────────────────────────────────────────
const Particle = ({ dark }: { dark: boolean; [key: string]: any }) => {
  const size  = Math.random() * 3 + 2;
  const left  = Math.random() * 100;
  const delay = Math.random() * 10;
  const dur   = Math.random() * 12 + 10;
  return (
    <span className="absolute rounded-full pointer-events-none" style={{
      width: size, height: size,
      left: `${left}%`, bottom: '-8px',
      background: dark ? 'rgba(99,102,241,0.55)' : 'rgba(59,130,246,0.4)',
      animation: `lpFloat ${dur}s ${delay}s infinite linear`,
    }} />
  );
};

// ── Animated counter ─────────────────────────────────────────────────────────
const Counter = ({ target, suffix = '' }: { target: number; suffix?: string }) => {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let v = 0;
      const step = target / 60;
      const t = setInterval(() => {
        v += step;
        if (v >= target) { setVal(target); clearInterval(t); }
        else setVal(Math.floor(v));
      }, 22);
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
};

// ── Glowing dot ──────────────────────────────────────────────────────────────
const GlowDot = ({ color = 'bg-blue-500' }: { color?: string }) => (
  <span className="relative flex h-3 w-3">
    <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', color)} />
    <span className={cn('relative inline-flex rounded-full h-3 w-3', color)} />
  </span>
);

// ── Falling stars ─────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  left:  `${Math.random() * 100}%`,
  delay: `${Math.random() * 15}s`,
  dur:   `${8 + Math.random() * 10}s`,   // 8-18s — chậm như lá rơi
  size:  Math.random() * 10 + 8,          // 8-18px
  sway:  Math.random() * 60 - 30,         // lắc ngang -30 đến +30px
  rotate: Math.random() * 360,            // góc xoay ban đầu
  opacity: 0.4 + Math.random() * 0.5,
}));

// SVG ngôi sao 5 cánh
const StarSVG = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
  </svg>
);

const STAR_COLORS = [
  'rgba(148,163,184,0.7)',   // slate
  'rgba(99,102,241,0.6)',    // indigo
  'rgba(59,130,246,0.6)',    // blue
  'rgba(52,211,153,0.5)',    // emerald
  'rgba(167,139,250,0.6)',   // violet
  'rgba(255,255,255,0.5)',   // white
];

const FallingStars = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {STARS.map(s => (
      <div
        key={s.id}
        style={{
          position: 'absolute',
          top: '-30px',
          left: s.left,
          opacity: 0,
          animation: `starFall ${s.dur} ${s.delay} infinite ease-in-out`,
          '--sway': `${s.sway}px`,
        } as React.CSSProperties}
      >
        <div style={{ animation: `starSpin ${s.dur} ${s.delay} infinite linear`, display: 'inline-block' }}>
          <StarSVG size={s.size} color={STAR_COLORS[s.id % STAR_COLORS.length]} />
        </div>
      </div>
    ))}
  </div>
);

interface LandingPageProps {
  theme: Theme;
  language: Language;
  setLanguage: (lang: Language) => void;
  setShowAuth: (show: boolean) => void;
  setAuthMode: (mode: 'login' | 'register') => void;
  t: any;
  plans: any[];
}

export const LandingPage = ({ theme, language, setLanguage, setShowAuth, setAuthMode, t, plans }: LandingPageProps) => {
  const [fetchedPlans, setFetchedPlans] = useState<any[]>([]);

  // Fetch plans từ API khi load landing page (không cần đăng nhập)
  useEffect(() => {
    PricingPlansApi.getAll().then(res => {
      if (res.success && res.data && res.data.length > 0) {
        setFetchedPlans(res.data.filter((p: any) => p.isActive !== false));
      }
    }).catch(() => {}); // silent fail — dùng fallback
  }, []);

  // Ưu tiên: plans từ App (đã đăng nhập) → plans fetch từ API → fallback hardcode
  const sourcePlans = plans.length > 0 ? plans : fetchedPlans;

  // Helper: parse price về số
  const parseNum = (v: any): number => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseInt(String(v).replace(/\D/g, ''), 10) || 0;
  };

  const displayPlans = sourcePlans.length > 0 ? sourcePlans.map((p: any) => ({
    name: p.name,
    priceNum: parseNum(p.price ?? p.planPrice ?? 0),
    features: Array.isArray(p.features)
      ? (typeof p.features[0] === 'string' ? p.features : p.features.map((f: any) => f.label ?? f))
      : [t.activeAgents, t.liveAlerts, t.ai],
    popular: p.isPopular ?? p.popular ?? false,
    billingPeriod: p.billingPeriod ?? 'monthly',
    isEnterprise: p.isEnterprise ?? false,
  })) : [
    { name: t.planStarter,    priceNum: 0,        features: [t.activeAgents, t.liveAlerts, t.ai],                       popular: false, billingPeriod: 'monthly', isEnterprise: false },
    { name: t.planPro,        priceNum: 2500000,   features: [t.unlimitedAgents, t.customReports, t.aiSupport],          popular: true,  billingPeriod: 'monthly', isEnterprise: false },
    { name: t.planEnterprise, priceNum: 0,         features: [t.dedicatedManager, t.mitreMapping, t.predictiveAnalysis], popular: false, billingPeriod: 'monthly', isEnterprise: true  },
  ];

  // Chọn tối đa 3 gói để hiển thị: rẻ nhất + đắt nhất + tầm trung (hoặc popular)
  const landingPlans = (() => {
    if (displayPlans.length <= 3) return displayPlans;

    const sorted = [...displayPlans].sort((a, b) => a.priceNum - b.priceNum);
    const cheapest  = sorted[0];                                    // rẻ nhất
    const priciest  = sorted[sorted.length - 1];                    // đắt nhất

    // Tầm trung: ưu tiên gói popular, nếu không thì lấy gói giữa
    const middle = displayPlans.find(p => p.popular && p !== cheapest && p !== priciest)
      ?? sorted[Math.floor(sorted.length / 2)];

    // Đảm bảo không trùng
    const three = [cheapest, middle, priciest].filter(
      (p, i, arr) => arr.indexOf(p) === i
    );

    // Nếu vẫn < 3 (ví dụ chỉ có 2 gói khác nhau), bổ sung thêm
    if (three.length < 3) {
      for (const p of sorted) {
        if (!three.includes(p)) three.push(p);
        if (three.length === 3) break;
      }
    }

    return three;
  })();

  return (
    <div className={cn("min-h-screen transition-colors duration-300 relative", theme === 'dark' ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-800")}>
      {/* Global keyframes + background effects */}
      <style>{`
        @keyframes lpFloat {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.5; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
        @keyframes lpGradientShift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes lpPulseRing {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes lpMeteor {
          0%   { transform: translateX(0) translateY(0) rotate(-45deg); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translateX(600px) translateY(600px) rotate(-45deg); opacity: 0; }
        }
        @keyframes starFall {
          0%   { transform: translateY(-30px) translateX(0);           opacity: 0; }
          5%   { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { transform: translateY(110vh) translateX(var(--sway)); opacity: 0; }
        }
        @keyframes starSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes lpOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(60px, -40px) scale(1.1); }
          66%      { transform: translate(-40px, 30px) scale(0.95); }
        }
        @keyframes lpOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-50px, 50px) scale(1.05); }
          66%      { transform: translate(40px, -30px) scale(1.1); }
        }
        @keyframes lpOrb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(30px, 40px) scale(1.08); }
        }
        @keyframes lpGridFade {
          0%, 100% { opacity: 0.03; }
          50%      { opacity: 0.07; }
        }
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }

        .lp-gradient-text {
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 40%, #34d399 70%, #60a5fa 100%);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
          animation: lpGradientShift 5s ease infinite;
        }
        .lp-card-hover {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .lp-card-hover:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 40px rgba(59,130,246,0.15);
        }
        /* Dot grid pattern */
        .lp-dot-grid {
          background-image: radial-gradient(circle, rgba(99,102,241,0.15) 1px, transparent 1px);
          background-size: 32px 32px;
          animation: lpGridFade 8s ease-in-out infinite;
        }
        /* Noise texture overlay */
        .lp-noise::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          opacity: 0.4;
        }
      `}</style>

      {/* ── Fixed background layer — orbs + grid ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Dot grid */}
        <div className="absolute inset-0 lp-dot-grid opacity-40" />

        {/* Aurora orb 1 — top left */}
        <div className="absolute rounded-full"
          style={{
            width: 600, height: 600,
            top: '-10%', left: '-10%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
            animation: 'lpOrb1 18s ease-in-out infinite',
            filter: 'blur(40px)',
          }} />

        {/* Aurora orb 2 — top right */}
        <div className="absolute rounded-full"
          style={{
            width: 500, height: 500,
            top: '5%', right: '-8%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)',
            animation: 'lpOrb2 22s ease-in-out infinite',
            filter: 'blur(50px)',
          }} />

        {/* Aurora orb 3 — center */}
        <div className="absolute rounded-full"
          style={{
            width: 700, height: 400,
            top: '40%', left: '25%',
            background: 'radial-gradient(ellipse, rgba(52,211,153,0.06) 0%, transparent 70%)',
            animation: 'lpOrb3 25s ease-in-out infinite',
            filter: 'blur(60px)',
          }} />

        {/* Aurora orb 4 — bottom */}
        <div className="absolute rounded-full"
          style={{
            width: 500, height: 500,
            bottom: '10%', right: '15%',
            background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)',
            animation: 'lpOrb1 20s ease-in-out infinite reverse',
            filter: 'blur(45px)',
          }} />

        {/* Horizontal glow line — removed */}
      </div>
      {/* Landing Navbar */}
      <nav className={cn("fixed top-0 w-full z-50 backdrop-blur-md border-b transition-colors", theme === 'dark' ? "bg-[#020617]/80 border-slate-800" : "bg-white/80 border-slate-200")}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield className="text-white" size={24} />
            </div>
            <span className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>VeriChainIDS</span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
              className="text-sm font-bold hover:text-blue-500 transition-colors"
            >
              {language === 'en' ? 'VI' : 'EN'}
            </button>
            <button 
              onClick={() => setShowAuth(true)}
              className="text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-blue-600/20"
            >
              {t.login}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 relative z-10 overflow-hidden">
        {/* Particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => <Particle key={i} dark={theme === 'dark'} />)}
        </div>

        {/* Background glow blobs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Live badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-semibold mb-8"
            >
              <GlowDot color="bg-green-400" />
              SOC Platform đang hoạt động · 99.99% uptime
            </motion.div>

            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 lp-gradient-text">
              {t.landingTitle}
            </h1>
            <p className="text-xl text-slate-500 max-w-3xl mx-auto mb-10">{t.landingSub}</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowAuth(true)}
                className="relative w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold px-10 py-4 rounded-xl transition-all shadow-xl shadow-blue-600/30 overflow-hidden group"
              >
                <span className="relative z-10">{t.getStarted}</span>
                {/* Shimmer */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                className={cn("w-full sm:w-auto border text-lg font-bold px-10 py-4 rounded-xl transition-all", theme === 'dark' ? "border-slate-700 hover:bg-slate-900 hover:border-slate-600" : "border-slate-200 hover:bg-slate-100")}
              >
                {t.learnMore}
              </motion.button>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-20 relative max-w-5xl mx-auto"
          >
            {/* Pulse rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              {[1, 2, 3].map(i => (
                <div key={i} className="absolute inset-0 rounded-full border border-blue-500/20"
                  style={{ animation: `lpPulseRing 3s ${i * 0.8}s ease-out infinite` }} />
              ))}
            </div>

            <div className={cn("rounded-2xl border p-2 shadow-2xl overflow-hidden", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
              {/* Scanline effect */}
              <div className="relative overflow-hidden rounded-xl">
                <img
                  src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200&h=600"
                  alt="Security Operations Center"
                  className="rounded-xl w-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(2,6,23,0.6))', borderRadius: 12 }} />
              </div>
            </div>
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/20 blur-[120px] rounded-full" />
          </motion.div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-12 border-y border-slate-800/30 overflow-hidden relative z-10">
        <FallingStars />
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm font-bold text-slate-500 uppercase tracking-widest mb-8">{t.trustedBy}</p>
          {/* Marquee */}
          <div className="relative flex overflow-hidden">
            <div className="flex gap-16 animate-[marquee_20s_linear_infinite] whitespace-nowrap">
              {['Microsoft', 'Amazon', 'Google', 'Netflix', 'Tesla', 'Cisco', 'IBM', 'Oracle'].map(b => (
                <span key={b} className="text-2xl font-black text-slate-500 hover:text-blue-400 transition-colors cursor-default">{b}</span>
              ))}
            </div>
            <div className="flex gap-16 animate-[marquee_20s_linear_infinite] whitespace-nowrap ml-16" aria-hidden>
              {['Microsoft', 'Amazon', 'Google', 'Netflix', 'Tesla', 'Cisco', 'IBM', 'Oracle'].map(b => (
                <span key={b} className="text-2xl font-black text-slate-500 hover:text-blue-400 transition-colors cursor-default">{b}</span>
              ))}
            </div>
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
          </div>
        </div>
        <style>{`@keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }`}</style>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 relative z-10">
        <FallingStars />
        {/* Section glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        </div>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Activity, title: t.feature1Title, desc: t.feature1Desc, color: 'text-blue-500' },
              { icon: Bot, title: t.feature2Title, desc: t.feature2Desc, color: 'text-emerald-500' },
              { icon: Zap, title: t.feature3Title, desc: t.feature3Desc, color: 'text-amber-500' }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn("p-8 rounded-2xl border transition-all lp-card-hover", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm")}
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6", feature.color === 'text-blue-500' ? 'bg-blue-500/10' : feature.color === 'text-emerald-500' ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
                  <feature.icon className={cn(feature.color)} size={28} />
                </div>
                <h3 className={cn("text-xl font-bold mb-4", theme === 'dark' ? "text-white" : "text-slate-900")}>{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-24 px-6 relative z-10">
        <FallingStars />
        {/* Diagonal glow line */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.2), transparent)' }} />
          <div className="absolute bottom-0 left-0 w-full h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.15), transparent)' }} />
          <div className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full -translate-y-1/2"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)', filter: 'blur(50px)' }} />
        </div>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className={cn("text-3xl lg:text-5xl font-bold mb-6", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.solutionsTitle}</h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">{t.solutionsSub}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-12">
              {[
                { title: t.solution1Title, desc: t.solution1Desc, icon: ShieldCheck },
                { title: t.solution2Title, desc: t.solution2Desc, icon: Cloud },
                { title: t.solution3Title, desc: t.solution3Desc, icon: Network }
              ].map((sol, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-6"
                >
                  <div className="bg-blue-600/10 p-4 rounded-2xl h-fit">
                    <sol.icon className="text-blue-500" size={32} />
                  </div>
                  <div>
                    <h3 className={cn("text-xl font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>{sol.title}</h3>
                    <p className="text-slate-500 leading-relaxed">{sol.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <img 
                src="https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=800&h=600" 
                alt="Security Solutions" 
                className="rounded-3xl shadow-2xl border border-slate-800/50"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-6 -right-6 bg-blue-600 p-8 rounded-3xl shadow-xl hidden md:block">
                <Lock className="text-white" size={48} />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How to Use Section */}
      <section className="py-20 px-6 relative z-10">
        <FallingStars />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={cn("text-3xl lg:text-4xl font-bold mb-4", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {t.howToUse}
            </h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto rounded-full" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connection Line (Desktop) */}
            <div className={cn("hidden md:block absolute top-8 left-0 w-full h-0.5 -z-10", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
            
            {[
              { step: "01", title: t.step1Title, desc: t.step1Desc, icon: User },
              { step: "02", title: t.step2Title, desc: t.step2Desc, icon: Server },
              { step: "03", title: t.step3Title, desc: t.step3Desc, icon: Activity }
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="flex flex-col items-center text-center"
              >
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-6 border-4 relative z-10 transition-colors",
                  theme === 'dark' ? "bg-slate-900 border-slate-800 text-blue-400" : "bg-white border-slate-100 text-blue-600 shadow-lg"
                )}>
                  <item.icon size={28} />
                  <span className={cn(
                    "absolute -top-2 -right-2 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2",
                    "bg-blue-600",
                    theme === 'dark' ? "border-slate-900" : "border-white"
                  )}>
                    {item.step}
                  </span>
                </div>
                <h3 className={cn("text-lg font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>{item.title}</h3>
                <p className="text-sm text-slate-500 max-w-[200px]">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section — 3 gói tĩnh */}
      <section className={cn('py-24 px-6 relative z-10', theme === 'dark' ? 'bg-slate-950/50' : 'bg-slate-100/50')}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={cn('text-3xl lg:text-5xl font-bold mb-4', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
              {t.pricingTitle}
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">{t.pricingSub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {landingPlans.map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{
                  scale: plan.popular ? 1.08 : 1.05,
                  y: -8,
                  transition: { type: 'spring', stiffness: 300, damping: 20 },
                }}
                className={cn(
                  'p-8 rounded-3xl border relative flex flex-col cursor-pointer',
                  plan.popular
                    ? 'bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-600/20 scale-105 z-10'
                    : theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10' : 'bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-xl hover:shadow-blue-100'
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                    ★ Phổ biến nhất
                  </span>
                )}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-8">
                  {plan.isEnterprise ? (
                    <span className="text-4xl font-black">Custom</span>
                  ) : plan.priceNum === 0 ? (
                    <span className="text-4xl font-black">Miễn phí</span>
                  ) : (
                    <>
                      <span className="text-4xl font-black">{plan.priceNum.toLocaleString('vi-VN')}</span>
                      <span className="text-sm opacity-70 ml-1">{t.vnd}/{plan.billingPeriod === 'yearly' ? 'năm' : 'tháng'}</span>
                    </>
                  )}
                </div>
                <ul className="space-y-3 mb-10 flex-1">
                  {plan.features.map((feat: string, j: number) => (
                    <li key={j} className="flex items-center gap-3 text-sm font-medium">
                      <Check size={16} className={plan.popular ? 'text-white' : 'text-blue-500'} />
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setShowAuth(true)}
                  className={cn(
                    'w-full py-4 rounded-xl font-bold transition-all',
                    plan.popular ? 'bg-white text-blue-600 hover:bg-slate-100' : 'bg-blue-600 text-white hover:bg-blue-500'
                  )}
                >
                  {t.getStarted}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 relative z-10">
        <FallingStars />
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            {[
              { label: t.statsRequests, target: 1200, suffix: 'M+' },
              { label: t.statsThreats,  target: 50,   suffix: 'M+' },
              { label: t.statsUptime,   target: 9999, suffix: '%', display: '99.99%' },
            ].map((stat, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <h2 className={cn("text-4xl lg:text-5xl font-bold mb-2 lp-gradient-text", theme === 'dark' ? "" : "")}>
                  {stat.display ?? <Counter target={stat.target} suffix={stat.suffix} />}
                </h2>
                <p className="text-slate-500 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={cn("py-12 px-6 border-t transition-colors relative z-10", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield className="text-white" size={24} />
            </div>
            <span className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>VeriChainIDS SOC</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 VeriChainIDS Security. All rights reserved.</p>
          <div className="flex gap-6">
            <button className="text-slate-500 hover:text-blue-500 transition-colors">Privacy Policy</button>
            <button className="text-slate-500 hover:text-blue-500 transition-colors">Terms of Service</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
