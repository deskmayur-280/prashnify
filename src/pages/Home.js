import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
// FIX #2: LazyMotion + domAnimation replaces full framer-motion import.
// Cuts JS bundle from ~95kb to ~57kb for this route.
// m.div/m.button/m.p are drop-in replacements for motion.div etc.
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { Crown, Play, Zap, Users, Target, Flame } from "lucide-react";

const Scanlines = () => (
  <div style={{
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100,
    opacity: 0.018,
    backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.5) 2px,rgba(255,255,255,0.5) 4px)"
  }} />
);

const Corners = ({ color = "#FF6B00", size = 18 }) => {
  const s = { position: "absolute", width: size, height: size, pointerEvents: "none" };
  const b = `2px solid ${color}`;
  return <>
    <div style={{ ...s, top: 0, left: 0, borderTop: b, borderLeft: b }} />
    <div style={{ ...s, top: 0, right: 0, borderTop: b, borderRight: b }} />
    <div style={{ ...s, bottom: 0, left: 0, borderBottom: b, borderLeft: b }} />
    <div style={{ ...s, bottom: 0, right: 0, borderBottom: b, borderRight: b }} />
  </>;
};

const XPChip = ({ value, x, onDone }) => (
  // Stays in Framer — mounts/unmounts dynamically on hold events.
  <m.div
    initial={{ opacity: 1, y: 0, scale: 1 }}
    animate={{ opacity: 0, y: -80, scale: 0.75 }}
    transition={{ duration: 1.3, ease: "easeOut" }}
    onAnimationComplete={onDone}
    style={{
      position: "absolute", left: x, bottom: 50, pointerEvents: "none", zIndex: 40,
      fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 11,
      color: "#FF6B00", textShadow: "0 0 10px #FF6B00, 0 0 22px rgba(255,107,0,0.5)",
      background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.4)",
      borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap",
    }}
  >+{value} XP</m.div>
);

const PrashnifyBrain = ({ onLaunch }) => {
  const [charge, setCharge] = useState(0);
  const [holding, setHolding] = useState(false);
  const [exploding, setExploding] = useState(false);
  const [chips, setChips] = useState([]);
  const intervalRef = useRef(null);
  const chargeRef = useRef(0);
  const containerRef = useRef(null);

  const spawnChip = useCallback(() => {
    const w = containerRef.current?.offsetWidth || 260;
    // FIX #5: Hard cap at 4 chips max.
    // Each chip is a mounted Framer instance. Without a cap,
    // a sustained hold spawns 20+ nodes and causes jank on low-end phones.
    setChips(c => {
      const next = [...c, {
        id: Date.now() + Math.random(),
        value: Math.floor(Math.random() * 60 + 15),
        x: 20 + Math.random() * (w - 80)
      }];
      return next.length > 4 ? next.slice(-4) : next;
    });
  }, []);

  const startHold = useCallback((e) => {
    e.preventDefault();
    setHolding(true);
    chargeRef.current = 0;
    intervalRef.current = setInterval(() => {
      chargeRef.current = Math.min(100, chargeRef.current + 2.8);
      setCharge(Math.round(chargeRef.current));
      if (chargeRef.current > 25 && Math.random() > 0.65) spawnChip();
      if (chargeRef.current >= 100) {
        clearInterval(intervalRef.current);
        setExploding(true);
        setTimeout(() => onLaunch?.(), 850);
      }
    }, 38);
  }, [spawnChip, onLaunch]);

  const endHold = useCallback(() => {
    clearInterval(intervalRef.current);
    setHolding(false);
    if (chargeRef.current < 100) { setCharge(0); chargeRef.current = 0; }
  }, []);

  const ratio = charge / 100;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", userSelect: "none" }}>
      {chips.map(c => <XPChip key={c.id} {...c} onDone={() => setChips(cs => cs.filter(x => x.id !== c.id))} />)}

      {/* Halos only animate when user is actively holding — no idle repeat:Infinity */}
      {[1, 2].map(i => (
        <m.div key={i} style={{
          position: "absolute", top: "50%", left: "50%",
          width: 160 + i * 36, height: 148 + i * 32,
          transform: "translate(-50%, -54%)",
          borderRadius: "50%", pointerEvents: "none",
          border: `1px solid rgba(255,107,0,${ratio * 0.35 / i})`,
          boxShadow: `0 0 ${14 * i}px rgba(255,${Math.floor(107 - ratio * 107)},0,${ratio * 0.28})`,
        }}
          animate={holding ? { scale: [1, 1.05, 1], opacity: [0.4, 0.9, 0.4] } : {}}
          transition={{ duration: 0.55, repeat: holding ? Infinity : 0, delay: i * 0.12 }}
        />
      ))}

      <m.div
        onPointerDown={startHold} onPointerUp={endHold}
        onPointerLeave={endHold} onPointerCancel={endHold}
        animate={exploding
          ? { scale: [1, 1.5, 0], rotate: [0, 12, -12, 0] }
          : holding ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={exploding ? { duration: 0.75 } : { duration: 0.35, repeat: holding ? Infinity : 0 }}
        style={{ cursor: "pointer", position: "relative", touchAction: "none" }}
      >
        <svg width="160" height="148" viewBox="0 0 160 148"
          style={{ filter: `drop-shadow(0 0 ${14 + charge * 0.45}px rgba(255,107,0,${0.35 + ratio * 0.5})) drop-shadow(0 0 ${6 + charge * 0.2}px rgba(255,0,85,${ratio * 0.4}))` }}>
          <defs>
            <radialGradient id="bg" cx="50%" cy="38%" r="60%">
              <stop offset="0%" stopColor={`hsl(${25 - ratio * 25},100%,${38 + ratio * 12}%)`} />
              <stop offset="55%" stopColor={`hsl(${340 + ratio * 20},85%,28%)`} />
              <stop offset="100%" stopColor="#080010" />
            </radialGradient>
            <filter id="softGlow">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <path d="M80,16 C50,16 30,33 28,54 C26,69 33,77 33,84 C31,98 22,107 24,118 C26,130 38,136 53,134 C59,138 67,142 80,142 C93,142 101,138 107,134 C122,136 134,130 136,118 C138,107 129,98 127,84 C127,77 134,69 132,54 C130,33 110,16 80,16Z"
            fill="url(#bg)" filter="url(#softGlow)" />

          {["M48,56 Q58,46 70,56 Q76,62 80,56","M80,56 Q84,62 90,56 Q102,46 112,56",
            "M42,76 Q54,66 64,76 Q70,84 78,76","M82,76 Q90,84 96,76 Q106,66 118,76",
            "M46,98 Q58,88 66,98 Q72,107 80,101","M80,101 Q88,107 94,98 Q102,88 114,98",
            "M58,120 Q68,112 76,120","M84,120 Q92,112 102,120",
          ].map((d, i) => (
            <path key={i} d={d} fill="none"
              stroke={`rgba(255,${Math.floor(107 - ratio * 60)},0,${0.18 + ratio * 0.48})`}
              strokeWidth="2" strokeLinecap="round" />
          ))}

          {charge > 55 && <m.path d="M80,16 L77,48 L81,80 L79,118" fill="none"
            stroke={`rgba(255,215,0,${(ratio - 0.55) * 1.5})`} strokeWidth="1.2"
            initial={{ pathLength: 0 }} animate={{ pathLength: (ratio - 0.55) * 2.2 }} />}
          {charge > 70 && <m.path d="M77,48 L60,36" fill="none"
            stroke={`rgba(255,107,0,${(ratio - 0.7) * 2})`} strokeWidth="0.9"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />}
          {charge > 70 && <m.path d="M81,80 L98,68" fill="none"
            stroke={`rgba(255,0,85,${(ratio - 0.7) * 2})`} strokeWidth="0.9"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />}

          {Array.from({ length: 4 }).map((_, row) =>
            Array.from({ length: 7 }).map((_, col) => {
              const idx = row * 7 + col;
              return <circle key={`${row}-${col}`}
                cx={44 + col * 12} cy={50 + row * 14} r="2.8"
                fill={idx < Math.floor(ratio * 28) ? `hsl(${25 - ratio * 25},100%,62%)` : "rgba(255,255,255,0.05)"} />;
            })
          )}
        </svg>

        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", gap: 1 }}>
          <span style={{
            fontFamily: "'Orbitron', sans-serif", fontWeight: 900,
            fontSize: charge > 0 ? 12 : 10, color: charge >= 100 ? "#FFD700" : "#FF6B00",
            textShadow: "0 0 14px currentColor", lineHeight: 1.25, textAlign: "center", transition: "font-size 0.2s"
          }}>
            {exploding ? "🚀" : charge >= 100 ? "100%" : charge > 0 ? `${charge}%` : "HOLD\nME"}
          </span>
        </div>
      </m.div>

      <div style={{ width: "100%", maxWidth: 200, height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,107,0,0.2)" }}>
        <m.div style={{
          height: "100%", borderRadius: 4, width: `${charge}%`,
          background: charge >= 100 ? "linear-gradient(90deg,#FFD700,#FF6B00)" : "linear-gradient(90deg,#FF6B00,#FF0055,#9D00FF)",
          boxShadow: `0 0 8px ${charge >= 100 ? "#FFD700" : "#FF6B00"}`,
          transition: "width 0.04s linear"
        }}
          // Only flashes at 100% — not an idle loop
          animate={charge >= 100 ? { opacity: [1, 0.4, 1] } : {}}
          transition={{ duration: 0.2, repeat: charge >= 100 ? Infinity : 0 }}
        />
      </div>

      {/* FIX #1: CSS animation — was Framer animate opacity repeat:Infinity */}
      <p className="hint-pulse" style={{
        fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 8,
        color: "#FF6B00", margin: 0, letterSpacing: "0.12em", textAlign: "center", textTransform: "uppercase"
      }}>
        {charge === 0 ? "▼ hold to charge ▼" : charge >= 100 ? "⚡ launching..." : `charging... ${charge}%`}
      </p>
    </div>
  );
};

const SampleQuestion = () => {
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const ANSWERS = [
    { label: "A", text: "Paris", color: "#FF6B00", correct: false },
    { label: "B", text: "Berlin", color: "#FF0055", correct: false },
    { label: "C", text: "Mumbai", color: "#00FF94", correct: true },
    { label: "D", text: "Tokyo", color: "#9D00FF", correct: false },
  ];
  const pick = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    setTimeout(() => setRevealed(true), 360);
  };
  return (
    <m.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, type: "spring", stiffness: 160 }}
      style={{ width: "calc(100% - 32px)", maxWidth: 420, margin: "0 auto", borderRadius: 18, overflow: "hidden",
        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,107,0,0.18)",
        backdropFilter: "blur(14px)", position: "relative" }}>
      <Corners color="rgba(255,107,0,0.4)" size={14} />
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          {/* FIX #1: .lb CSS class instead of Framer repeat:Infinity */}
          <span className="lb" style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6B00", display: "block", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, color: "rgba(255,255,255,0.32)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Try a sample question
          </span>
        </div>
        <p style={{ color: "white", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: "clamp(0.95rem,4.6vw,1.2rem)", lineHeight: 1.4, margin: 0 }}>
          Which city is known as the "City of Dreams" in India? 🌆
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, padding: 12 }}>
        {ANSWERS.map((ans, idx) => {
          const isSel = selected === idx, isOk = revealed && ans.correct, isBad = revealed && isSel && !ans.correct;
          return (
            <m.button key={idx} whileTap={selected === null ? { scale: 0.95 } : {}}
              animate={isOk ? { scale: [1, 1.04, 1] } : {}} onClick={() => pick(idx)}
              style={{ borderRadius: 12, textAlign: "left", padding: "11px 13px", minHeight: 56,
                cursor: selected !== null ? "default" : "pointer",
                background: isOk ? "rgba(0,255,148,0.14)" : isBad ? "rgba(255,0,85,0.14)" : isSel ? `${ans.color}1e` : "rgba(255,255,255,0.04)",
                border: `2px solid ${isOk ? "#00FF94" : isBad ? "#FF0055" : isSel ? ans.color : "rgba(255,255,255,0.08)"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isOk ? "#00FF94" : isBad ? "#FF0055" : ans.color, color: "white", fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 11 }}>
                  {isOk ? "✓" : isBad ? "✗" : ans.label}
                </span>
                <span style={{ color: "white", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 14 }}>{ans.text}</span>
              </div>
            </m.button>
          );
        })}
      </div>
      <AnimatePresence>
        {revealed && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: selected === 2 ? "linear-gradient(90deg,rgba(0,255,148,0.11),transparent)" : "linear-gradient(90deg,rgba(255,0,85,0.11),transparent)",
              borderTop: `1px solid ${selected === 2 ? "rgba(0,255,148,0.25)" : "rgba(255,0,85,0.25)"}` }}>
              <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, color: selected === 2 ? "#00FF94" : "#FF0055", fontSize: 13 }}>
                {selected === 2 ? "🎉 Correct! Mumbai it is!" : "❌ It's Mumbai!"}
              </span>
              <button onClick={() => { setSelected(null); setRevealed(false); }}
                style={{ color: "rgba(255,255,255,0.38)", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 11, background: "none", border: "none", cursor: "pointer" }}>
                retry ↺
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
};

const HowItWorks = () => {
  const steps = [
    { icon: "🔑", label: "Get a code", desc: "Host shares a quiz code" },
    { icon: "⚡", label: "Join instantly", desc: "No signup needed" },
    { icon: "🧠", label: "Battle live", desc: "Answer & earn XP" },
    { icon: "🏆", label: "Top the board", desc: "Win the podium" },
  ];
  return (
    <m.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, type: "spring" }}
      style={{ width: "calc(100% - 32px)", maxWidth: 420, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.18em" }}>HOW IT WORKS</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {steps.map((s, i) => (
          <m.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.95 + i * 0.07, type: "spring" }}
            style={{ borderRadius: 14, padding: "13px 14px", position: "relative",
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,107,0,0.12)" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 13, color: "white", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.38)" }}>{s.desc}</div>
            <div style={{ position: "absolute", top: 10, right: 12, fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 20, color: "rgba(255,107,0,0.1)" }}>0{i + 1}</div>
          </m.div>
        ))}
      </div>
    </m.div>
  );
};

export default function Home() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(null);
  const audioRef = useRef(null);

  const playSound = useCallback((freq = 440, dur = 120, type = "sine") => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioRef.current.createOscillator(), g = audioRef.current.createGain();
      o.connect(g); g.connect(audioRef.current.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.07, audioRef.current.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioRef.current.currentTime + dur / 1000);
      o.start(); o.stop(audioRef.current.currentTime + dur / 1000);
    } catch {}
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(3);
    playSound(523, 170, "square");
    const iv = setInterval(() => setCountdown(prev => {
      if (prev <= 1) { clearInterval(iv); playSound(784, 300, "square"); setTimeout(() => navigate("/join"), 380); return 0; }
      playSound(523, 170, "square"); return prev - 1;
    }), 1000);
  }, [navigate, playSound]);

  const handleBrainLaunch = useCallback(() => {
    playSound(659, 200, "sine"); setTimeout(startCountdown, 180);
  }, [playSound, startCountdown]);

  return (
    // FIX #2: LazyMotion wrapper — loads only the domAnimation subset (~57kb vs ~95kb).
    // Every m.* inside here uses that smaller bundle. AnimatePresence works unchanged.
    <LazyMotion features={domAnimation} strict>
      <div style={{ minHeight: "100vh", background: "#06010f", overflowX: "hidden", position: "relative" }}>
        <style>{`
          /* FIX #7: @import REMOVED — fonts now preloaded in index.html.
             Font request now starts before React boots instead of 800-1200ms later. */

          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          body { margin: 0; }
          ::-webkit-scrollbar { display: none; }

          @keyframes scrolltick { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
          .scrolltick { animation: scrolltick 22s linear infinite; }

          @keyframes lb { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }
          .lb { animation: lb 1.3s infinite; }

          @keyframes shine { 0% { left:-60% } 100% { left:120% } }
          .shine { position:relative; overflow:hidden; }
          .shine::after { content:''; position:absolute; top:0; left:-60%; width:50%; height:100%;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
            animation:shine 3s linear infinite 0.8s; }

          @keyframes flicker { 0%,91%,93%,100% { opacity:1 } 92% { opacity:0.72 } }
          .flicker { animation: flicker 7s infinite; }

          /* FIX #1: Two new CSS keyframes replacing Framer repeat:Infinity loops.
             hint-pulse → was: animate={{ opacity:[0.4,1,0.4] }} repeat:Infinity
             bar-seg    → was: 6× animate={{ scaleX,opacity }} repeat:Infinity     */
          @keyframes hintPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
          .hint-pulse { animation: hintPulse 2s ease-in-out infinite; }

          @keyframes barPulse { 0%,100% { opacity:0.45; transform:scaleX(1) } 50% { opacity:1; transform:scaleX(1.07) } }
          .bar-seg { animation: barPulse 1.7s ease-in-out infinite; }
        `}</style>

        <Scanlines />

        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ position: "absolute", top: "-22%", left: "-32%", width: "85vw", height: "85vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,0,0.09) 0%,transparent 65%)" }} />
          <div style={{ position: "absolute", bottom: "-18%", right: "-24%", width: "75vw", height: "75vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(157,0,255,0.08) 0%,transparent 65%)" }} />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.032 }}>
            <defs><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M36,0 L0,0 0,36" fill="none" stroke="#FF6B00" strokeWidth="0.5" />
            </pattern></defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <AnimatePresence>
          {countdown !== null && (
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(6,1,15,0.92)", backdropFilter: "blur(20px)" }}>
              <m.div key={countdown} initial={{ scale: 0.2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 2.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: "clamp(7rem,36vw,15rem)", lineHeight: 1,
                  background: "linear-gradient(135deg,#FF6B00 0%,#FF0055 50%,#9D00FF 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 55px rgba(255,107,0,0.7))" }}>
                {countdown === 0 ? "🚀" : countdown}
              </m.div>
              <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 20, letterSpacing: "0.2em" }}>
                {countdown > 0 ? "ENTERING ARENA..." : "LOADING..."}
              </m.p>
            </m.div>
          )}
        </AnimatePresence>

        <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingBottom: 52 }}>

          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.22)" }}>
              {/* FIX #1: .lb CSS instead of Framer animate opacity repeat:Infinity */}
              <span className="lb" style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6B00", display: "block", flexShrink: 0 }} />
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, color: "#FF6B00", fontSize: 9, letterSpacing: "0.1em" }}>QUIZ ARENA</span>
            </div>
            <m.button whileTap={{ scale: 0.92 }} onClick={() => navigate("/admin")} data-testid="admin-panel-button"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 99, background: "linear-gradient(135deg,#9D00FF,#6500AA)",
                boxShadow: "0 0 18px rgba(157,0,255,0.45)", fontFamily: "'Orbitron', sans-serif", fontWeight: 700, color: "white", fontSize: 11, border: "none", cursor: "pointer" }}>
              <Crown size={12} />Admin
            </m.button>
          </div>

          <m.div initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, type: "spring", stiffness: 200 }} style={{ textAlign: "center", padding: "0 16px" }}>
            <h1 data-testid="home-title" className="flicker"
              style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: "clamp(2.8rem,16vw,5rem)", margin: 0, lineHeight: 1.05,
                background: "linear-gradient(135deg,#FF6B00 0%,#FF0055 50%,#9D00FF 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 0 20px rgba(255,107,0,0.45))" }}>
              Prashnify
            </h1>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
              <div style={{ flex: 1, height: 1, maxWidth: 60, background: "linear-gradient(90deg,transparent,rgba(255,107,0,0.4))" }} />
              <p data-testid="home-subtitle" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, color: "rgba(255,255,255,0.35)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                Real-Time Quiz Battle Arena
              </p>
              <div style={{ flex: 1, height: 1, maxWidth: 60, background: "linear-gradient(90deg,rgba(255,107,0,0.4),transparent)" }} />
            </div>
          </m.div>

          {/* FIX #1: Plain divs + CSS — replaces 6 Framer repeat:Infinity instances */}
          <div style={{ width: "calc(100% - 32px)", maxWidth: 420, display: "flex", gap: 3, height: 3 }}>
            {["#FF6B00","#FF0055","#9D00FF","#00FF94","#FF6B00","#FF0055"].map((c, i) => (
              <div key={i} className="bar-seg" style={{ flex: 1, background: c, borderRadius: 2, animationDelay: `${i * 0.13}s` }} />
            ))}
          </div>

          <m.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22, type: "spring", stiffness: 220 }}
            style={{ width: "calc(100% - 32px)", maxWidth: 380, borderRadius: 22, padding: "26px 20px 22px",
              background: "linear-gradient(145deg,rgba(255,107,0,0.05),rgba(157,0,255,0.05))",
              border: "1px solid rgba(255,107,0,0.18)", position: "relative" }}>
            <Corners color="rgba(255,107,0,0.45)" size={16} />
            <PrashnifyBrain onLaunch={handleBrainLaunch} />
          </m.div>

          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, type: "spring" }}
            style={{ width: "calc(100% - 32px)", maxWidth: 420, display: "flex", gap: 10 }}>
            <m.button data-testid="join-quiz-button" whileTap={{ scale: 0.95 }} onClick={startCountdown} className="shine"
              style={{ flex: 2, height: 62, borderRadius: 16, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#FF6B00 0%,#FF0055 100%)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 17, color: "white",
                boxShadow: "0 0 28px rgba(255,107,0,0.45), 0 4px 20px rgba(0,0,0,0.4)" }}>
              <Play size={20} fill="white" strokeWidth={0} />Join Quiz
            </m.button>
            <m.button whileTap={{ scale: 0.95 }} onClick={() => navigate("/admin")}
              style={{ flex: 1, height: 62, borderRadius: 16, cursor: "pointer", background: "rgba(157,0,255,0.12)",
                border: "1.5px solid rgba(157,0,255,0.38)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 14, color: "white", boxShadow: "0 0 18px rgba(157,0,255,0.2)" }}>
              <Crown size={15} color="#9D00FF" />Host
            </m.button>
          </m.div>

          <div style={{ width: "100%", overflow: "hidden", borderTop: "1px solid rgba(255,107,0,0.1)", borderBottom: "1px solid rgba(255,107,0,0.1)", padding: "8px 0", background: "rgba(255,107,0,0.022)" }}>
            <div className="scrolltick" style={{ whiteSpace: "nowrap", display: "inline-flex", gap: 22, fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,107,0,0.75)" }}>
              {[0, 1].map(ri => (
                <span key={ri} style={{ display: "inline-flex", alignItems: "center", gap: 20 }}>
                  <span>⚡ INSTANT JOIN</span><span style={{ opacity: 0.3 }}>◆</span>
                  <span>🏆 WIN TROPHIES</span><span style={{ opacity: 0.3 }}>◆</span>
                  <span>🎯 NO SIGNUP</span><span style={{ opacity: 0.3 }}>◆</span>
                  <span>🧠 PRASHNIFY</span><span style={{ opacity: 0.3 }}>◆</span>
                  <span>🚀 LIVE BATTLES</span><span style={{ opacity: 0.3 }}>◆</span>
                  <span>🔥 KAHOOT KILLER</span><span style={{ opacity: 0.3 }}>◆</span>
                </span>
              ))}
            </div>
          </div>

          <SampleQuestion />
          <HowItWorks />

          <m.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, type: "spring" }}
            style={{ width: "calc(100% - 32px)", maxWidth: 420, display: "flex", gap: 11 }}>
            <div style={{ flex: 1, borderRadius: 18, padding: "16px 14px", textAlign: "center", background: "linear-gradient(155deg,rgba(255,107,0,0.1),rgba(255,0,85,0.05))", border: "1.5px solid rgba(255,107,0,0.28)", boxShadow: "0 0 22px rgba(255,107,0,0.1)" }}>
              <div style={{ fontSize: 28, marginBottom: 7 }}>🎮</div>
              <p style={{ color: "white", fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 13, lineHeight: 1.2, margin: "0 0 4px" }}>Join a Quiz</p>
              <p style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 11, margin: 0 }}>Enter code & battle live</p>
            </div>
            <div style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 16, background: "linear-gradient(135deg,#FF6B00,#9D00FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 0 8px rgba(157,0,255,0.55))" }}>VS</span>
            </div>
            <div style={{ flex: 1, borderRadius: 18, padding: "16px 14px", textAlign: "center", background: "linear-gradient(155deg,rgba(157,0,255,0.1),rgba(255,0,85,0.05))", border: "1.5px solid rgba(157,0,255,0.28)", boxShadow: "0 0 22px rgba(157,0,255,0.1)" }}>
              <div style={{ fontSize: 28, marginBottom: 7 }}>👑</div>
              <p style={{ color: "white", fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 13, lineHeight: 1.2, margin: "0 0 4px" }}>Host a Quiz</p>
              <p style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 11, margin: 0 }}>Create & launch your own</p>
            </div>
          </m.div>

          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }}
            style={{ display: "flex", gap: 9, padding: "0 16px", width: "100%", overflowX: "auto", scrollbarWidth: "none" }}>
            {[
              { icon: <Zap size={12} />, label: "Live Scores", color: "#00FF94" },
              { icon: <Users size={12} />, label: "100+ Players", color: "#FF6B00" },
              { icon: <Target size={12} />, label: "No Signup", color: "#9D00FF" },
              { icon: <Flame size={12} />, label: "Streak Bonus", color: "#FF0055" },
            ].map((f, i) => (
              <m.div key={i} whileTap={{ scale: 0.93 }}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 99, flexShrink: 0,
                  background: `${f.color}10`, border: `1px solid ${f.color}28`, color: f.color,
                  fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
                {f.icon}{f.label}
              </m.div>
            ))}
          </m.div>

          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.25 }}
            style={{ width: "calc(100% - 32px)", maxWidth: 420, borderRadius: 18, padding: "16px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
              background: "linear-gradient(135deg,rgba(255,107,0,0.07),rgba(157,0,255,0.07))",
              border: "1px solid rgba(255,107,0,0.16)" }}>
            <div>
              <p style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 15, color: "white", margin: "0 0 3px" }}>Ready to blast? 🔥</p>
              <p style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.38)", margin: 0 }}>Hold the brain or tap below</p>
            </div>
            <m.button whileTap={{ scale: 0.92 }} onClick={startCountdown}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 18px", borderRadius: 12, background: "white", color: "#06010f",
                fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 13, border: "none", cursor: "pointer", flexShrink: 0, boxShadow: "0 4px 20px rgba(255,255,255,0.16)" }}>
              <Flame size={14} color="#FF6B00" />Play
            </m.button>
          </m.div>

        </div>
      </div>
    </LazyMotion>
  );
}