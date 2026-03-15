import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Trophy, Crown, Star, ArrowRight, TrendingUp, Medal, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { useSocket } from '../context/SocketContext';
import { API_BASE_URL } from '../config';

const API = `${API_BASE_URL}/api`;

/* ─── CSS injected once for GPU-composited animations ─── */
const STYLES = `
@keyframes lb-float {
  0%   { transform: translateY(0) rotate(0deg);   opacity: 0.7; }
  100% { transform: translateY(-110vh) rotate(720deg); opacity: 0; }
}
@keyframes lb-slide-in {
  from { opacity: 0; transform: translateX(-28px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes lb-shimmer {
  0%, 100% { opacity: 0.15; }
  50%       { opacity: 0.3;  }
}
@keyframes lb-bounce-y {
  0%, 100% { transform: translateY(0)  rotate(0deg);  }
  30%       { transform: translateY(-6px) rotate(5deg);  }
  60%       { transform: translateY(-3px) rotate(-5deg); }
}
@keyframes lb-marquee {
  0%   { transform: translateX(0); }
  45%  { transform: translateX(-60%); }
  90%  { transform: translateX(-60%); }
  100% { transform: translateX(0); }
}

@keyframes lb-pill-up {
  0%   { opacity: 0;   transform: translateY(14px) scale(0.55); }
  12%  { opacity: 1;   transform: translateY(-5px) scale(1.25); }
  22%  { opacity: 1;   transform: translateY(0px)  scale(1);    }
  72%  { opacity: 1;   transform: translateY(0px)  scale(1);    }
  100% { opacity: 0;   transform: translateY(-12px) scale(0.75); }
}
@keyframes lb-pill-down {
  0%   { opacity: 0;   transform: translateY(-14px) scale(0.55); }
  12%  { opacity: 1;   transform: translateY(5px)   scale(1.25); }
  22%  { opacity: 1;   transform: translateY(0px)   scale(1);    }
  72%  { opacity: 1;   transform: translateY(0px)   scale(1);    }
  100% { opacity: 0;   transform: translateY(12px)  scale(0.75); }
}
@keyframes lb-pill-pulse-up {
  0%,100% { box-shadow: 0 0 0px 0px rgba(34,197,94,0); }
  25%,65% { box-shadow: 0 0 12px 4px rgba(34,197,94,0.65); }
}
@keyframes lb-pill-pulse-down {
  0%,100% { box-shadow: 0 0 0px 0px rgba(239,68,68,0); }
  25%,65% { box-shadow: 0 0 12px 4px rgba(239,68,68,0.65); }
}

.lb-card-enter { animation: lb-slide-in 0.35s cubic-bezier(0.22,1,0.36,1) both; }
.lb-shimmer    { animation: lb-shimmer 2s ease-in-out infinite; will-change: opacity; }
.lb-trophy     { animation: lb-bounce-y 2.5s ease-in-out infinite; will-change: transform; }
.lb-marquee    { animation: lb-marquee 5s linear infinite; will-change: transform; display: inline-block; }

.lb-pill-up {
  animation:
    lb-pill-up        5.5s cubic-bezier(0.22,1,0.36,1) forwards,
    lb-pill-pulse-up  5.5s ease-in-out forwards;
  will-change: transform, opacity, box-shadow;
}
.lb-pill-down {
  animation:
    lb-pill-down        5.5s cubic-bezier(0.22,1,0.36,1) forwards,
    lb-pill-pulse-down  5.5s ease-in-out forwards;
  will-change: transform, opacity, box-shadow;
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.textContent = STYLES;
  document.head.appendChild(el);
}

/* ─── Particles: pure CSS, no JS per frame ─── */
const PARTICLE_COLORS = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#95E1D3'];
const Particles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    {Array.from({ length: 24 }, (_, i) => {
      const size  = 6 + (i % 4) * 2;
      const left  = `${(i * 37 + 11) % 97}%`;
      const dur   = 7 + (i % 6);
      const delay = (i * 0.4) % 5;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left,
            bottom: '-12px',
            width: size,
            height: size,
            borderRadius: '50%',
            background: PARTICLE_COLORS[i % 5],
            animation: `lb-float ${dur}s ${delay}s linear infinite`,
            willChange: 'transform',
          }}
        />
      );
    })}
  </div>
);

/* ─── Scrolling name: CSS marquee, only when genuinely long ─── */
const ScrollingName = ({ name, isCurrentPlayer }) => {
  const display = `${name}${isCurrentPlayer ? ' (You)' : ''}`;
  const isLong  = display.length > 16;
  return (
    <div
      className="overflow-hidden max-w-full"
      style={isLong ? { maskImage: 'linear-gradient(to right, black 80%, transparent 100%)' } : undefined}
    >
      <h3
        className={`lb-name text-base sm:text-lg md:text-xl font-bold text-white whitespace-nowrap ${isLong ? 'lb-marquee' : ''}`}
        title={display}
      >
        {display}
      </h3>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   RankChangePill
   • Rendered as its own component so React key-based remounting works correctly
   • `key={animKey}` on the parent ensures a NEW DOM node is created every time
     the same player changes rank, which re-starts the CSS animation from 0%
   • `useEffect` cleans nothing — the CSS `forwards` fill keeps it visible until
     the parent unmounts the node after the timer fires
───────────────────────────────────────────────────────────────────────────── */
const RankChangePill = ({ delta, animKey }) => {
  const isUp = delta > 0;
  return (
    <span
      className={[
        'flex-shrink-0 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5',
        'text-xs font-black select-none pointer-events-none',
        isUp ? 'bg-green-500 text-white lb-pill-up' : 'bg-red-500 text-white lb-pill-down',
      ].join(' ')}
      style={{ minWidth: '2rem', justifyContent: 'center' }}
      aria-label={isUp ? `Rank up ${delta}` : `Rank down ${Math.abs(delta)}`}
    >
      {isUp
        ? <><ChevronUp   className="w-3 h-3 flex-shrink-0" /><span>{delta}</span></>
        : <><ChevronDown className="w-3 h-3 flex-shrink-0" /><span>{Math.abs(delta)}</span></>}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   usePersistentRankChanges
   • Reads previous rank snapshot from localStorage (survives navigation)
   • Computes per-player delta and assigns a unique animKey
   • Sets a 5.6 s timer per player to remove the pill from state AFTER animation
     ends — so it disappears cleanly with no pop / flash
───────────────────────────────────────────────────────────────────────────── */
function usePersistentRankChanges(code) {
  const [rankChanges, setRankChanges] = useState({});
  const timerRefs = useRef({});

  const compute = useCallback((newLeaderboard) => {
    const storageKey = `lb_ranks_v2_${code}`;
    let prevRanks    = {};

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) prevRanks = JSON.parse(raw);
    } catch { /* ignore */ }

    const now     = Date.now();
    const changes = {};

    newLeaderboard.forEach((entry, idx) => {
      const currentRank = idx + 1;
      const prevRank    = prevRanks[entry.participantId];
      if (prevRank !== undefined && prevRank !== currentRank) {
        changes[entry.participantId] = {
          delta:   prevRank - currentRank,
          /* Unique key: forces React to unmount old pill and mount fresh one */
          animKey: `${entry.participantId}_${now}_${idx}`,
        };
      }
    });

    /* Persist current snapshot for next question comparison */
    try {
      const snap = {};
      newLeaderboard.forEach((e, i) => { snap[e.participantId] = i + 1; });
      localStorage.setItem(storageKey, JSON.stringify(snap));
    } catch { /* ignore */ }

    /* Merge new changes into state without blowing away others still animating */
    setRankChanges(prev => ({ ...prev, ...changes }));

    /* Schedule pill removal for each changed player after animation finishes */
    Object.entries(changes).forEach(([pid, ch]) => {
      clearTimeout(timerRefs.current[pid]);
      timerRefs.current[pid] = setTimeout(() => {
        setRankChanges(prev => {
          if (prev[pid]?.animKey !== ch.animKey) return prev; // newer update exists, leave it
          const next = { ...prev };
          delete next[pid];
          return next;
        });
      }, 5700); /* 200 ms buffer after 5.5 s animation */
    });
  }, [code]);

  useEffect(() => {
    return () => Object.values(timerRefs.current).forEach(clearTimeout);
  }, []);

  return { rankChanges, compute };
}

/* ─── Main component ─── */
const Leaderboard = () => {
  const { code }          = useParams();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const confettiFired     = useRef(false);

  const questionNumber = parseInt(searchParams.get('qnum')  || '1', 10);
  const totalParam     = parseInt(searchParams.get('total') || '0', 10);
  const finalFlag      = searchParams.get('final');

  const [leaderboard, setLeaderboard]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [totalQuestions, setTotalQuestions] = useState(totalParam);

  const { rankChanges, compute } = usePersistentRankChanges(code);

  const { socket, isConnected, connect, send, addListener } = useSocket();
  const isAdmin       = localStorage.getItem('isAdmin') === 'true';
  const participantId = localStorage.getItem('participantId');

  const isFinalLeaderboard =
    finalFlag === '1' || (totalQuestions > 0 && questionNumber >= totalQuestions);

  /* inject CSS once */
  useEffect(() => { injectStyles(); }, []);

  /* data fetch */
  useEffect(() => {
    fetchResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchResults = async () => {
    try {
      const [leaderboardRes, quizRes] = await Promise.all([
        axios.get(`${API}/leaderboard/${code}`),
        axios.get(`${API}/quiz/${code}/info`),
      ]);

      const newLeaderboard = leaderboardRes.data;

      /* compute rank deltas BEFORE setting state so pills render with the cards */
      compute(newLeaderboard);

      setLeaderboard(newLeaderboard);

      if (totalParam === 0 && quizRes.data.questionsCount) {
        setTotalQuestions(quizRes.data.questionsCount);
      }

      setLoading(false);

      /* defer confetti so it never blocks first paint */
      if (!confettiFired.current) {
        confettiFired.current = true;
        const fire = () => confetti({ particleCount: 80, spread: 65, origin: { y: 0.6 } });
        if ('requestIdleCallback' in window) {
          requestIdleCallback(fire, { timeout: 1000 });
        } else {
          setTimeout(fire, 600);
        }
      }
    } catch {
      toast.error('Failed to load leaderboard');
      setLoading(false);
    }
  };

  /* socket connection */
  useEffect(() => {
    if (!isConnected) connect(code, participantId || null, isAdmin);
  }, [isConnected, code, participantId, isAdmin, connect]);

  /* socket listeners */
  useEffect(() => {
    if (!socket) return;

    const off1 = addListener('next_question', () => navigate(`/quiz/${code}`));
    const off2 = addListener('show_podium',   () => navigate(`/podium/${code}`));
    const off3 = addListener('quiz_ended',    () => {
      toast.info('📢 Quiz has been ended by the host');
      navigate(isAdmin ? '/admin' : '/');
    });
    const off4 = addListener('participant_kicked', (d) => {
      if (!isAdmin && d.participantId === participantId) {
        localStorage.removeItem('participantId');
        localStorage.removeItem('participantName');
        toast.error('You have been removed from this quiz by the host');
        navigate('/');
      }
    });
    const off5 = addListener('you_were_kicked', (d) => {
      localStorage.removeItem('participantId');
      localStorage.removeItem('participantName');
      toast.error(d.reason || 'You have been removed from this quiz');
      navigate('/');
    });

    return () => { off1(); off2(); off3(); off4(); off5(); };
  }, [socket, addListener, navigate, code, isAdmin, participantId]);

  const handleNext = () => { if (socket) send({ type: 'next_question' }); };

  /* ── Loading spinner ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <div
          style={{
            width: 64, height: 64,
            border: '8px solid rgba(250,191,36,0.3)',
            borderTopColor: '#FBBF24',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 relative overflow-hidden">
      <Particles />

      <div className="relative z-10 min-h-screen p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="text-center mb-6 md:mb-8"
            style={{ animation: 'lb-slide-in 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
            <div className="inline-block mb-4">
              <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-2xl">
                <BarChart3 className="w-9 h-9 md:w-14 md:h-14 text-white" />
              </div>
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-7xl font-black text-white mb-2 drop-shadow-lg"
              style={{ fontFamily: "'Fredoka', sans-serif" }}
            >
              {isFinalLeaderboard ? 'Final Standings!' : 'Leaderboard'}
            </h1>

            <p className="text-base sm:text-xl md:text-2xl text-white/90 font-semibold px-2">
              {isFinalLeaderboard
                ? `Quiz Complete! ${leaderboard.length} players competed`
                : `After Question ${questionNumber} of ${totalQuestions}`}
            </p>
          </div>

          {/* Leaderboard list */}
          <div
            className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-3 sm:p-4 md:p-8 border-2 border-white/20 mb-6 md:mb-8"
            style={{ animation: 'lb-slide-in 0.5s 0.15s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="space-y-2 sm:space-y-3">
              {leaderboard.map((entry, index) => {
                const isCurrentPlayer = entry.participantId === participantId;
                const rank   = entry.rank || (index + 1);
                const isTop3 = rank <= 3;
                const ch     = rankChanges[entry.participantId];
                const delay  = `${index * 40}ms`;

                return (
                  <div
                    key={entry.participantId}
                    className={`lb-card-enter relative overflow-hidden rounded-2xl shadow-lg
                      ${isCurrentPlayer
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 ring-4 ring-yellow-300 scale-[1.02]'
                        : isTop3
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : 'bg-white/20 backdrop-blur-sm'}`}
                    style={{ animationDelay: delay, willChange: 'transform, opacity' }}
                  >
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 md:p-5">

                      {/* Rank badge */}
                      <div className={`flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black text-base md:text-2xl
                        ${isTop3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-xl' : 'bg-white text-gray-700'}`}>
                        {rank === 1 && <Crown className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                        {rank === 2 && <Medal className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                        {rank === 3 && <Star  className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                        {rank > 3   && <span className="text-sm sm:text-base md:text-xl">{rank}</span>}
                      </div>

                      {/* Avatar */}
                      <div className="flex-shrink-0 transition-transform duration-200 hover:scale-110">
                        <DicebearAvatar
                          seed={entry.avatarSeed}
                          size="md"
                          className="w-9 h-9 sm:w-12 sm:h-12 md:w-16 md:h-16 ring-2 md:ring-4 ring-white/50 shadow-xl"
                        />
                      </div>

                      {/* Name + time + rank pill */}
                      <div className="flex-1 min-w-[80px] min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex-1 min-w-0">
                            <ScrollingName name={entry.name} isCurrentPlayer={isCurrentPlayer} />
                          </div>

                          {/* Rank change pill — key forces fresh mount on every new animKey */}
                          {ch && ch.delta !== 0 && (
                            <RankChangePill
                              key={ch.animKey}
                              delta={ch.delta}
                              animKey={ch.animKey}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-0.5">
                          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-white/80 flex-shrink-0" />
                          <span className="text-xs sm:text-sm text-white/80 font-semibold">{entry.totalTime.toFixed(1)}s</span>
                        </div>
                      </div>

                      {/* Score pill */}
                      <div className="flex-shrink-0 flex items-center gap-1 sm:gap-2 bg-white/20 backdrop-blur-sm rounded-full px-2.5 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-3">
                        <Star className="w-3.5 h-3.5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-yellow-300 flex-shrink-0" />
                        <span className="text-lg sm:text-2xl md:text-3xl font-black text-white">{entry.score}</span>
                      </div>
                    </div>

                    {/* Shimmer for current player */}
                    {isCurrentPlayer && (
                      <div className="lb-shimmer absolute inset-0 bg-white pointer-events-none rounded-2xl" />
                    )}

                    {/* Trophy for rank 1 */}
                    {rank === 1 && (
                      <div className="lb-trophy absolute top-2 right-2 pointer-events-none">
                        <Trophy className="w-5 h-5 md:w-8 md:h-8 text-yellow-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin controls */}
          {isAdmin && (
            <div className="text-center pb-6" style={{ animation: 'lb-slide-in 0.4s 0.4s both' }}>
              <Button
                onClick={handleNext}
                size="lg"
                className="bg-white text-purple-600 hover:bg-gray-100 font-black text-xl sm:text-2xl md:text-3xl px-8 sm:px-12 md:px-16 py-5 sm:py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-3 sm:gap-4 mx-auto active:scale-95 transition-transform"
                style={{ fontFamily: 'Fredoka, sans-serif' }}
              >
                {isFinalLeaderboard
                  ? <><Trophy className="w-7 h-7 md:w-10 md:h-10" />Show Winners</>
                  : <>Next Question<ArrowRight className="w-7 h-7 md:w-10 md:h-10" /></>}
              </Button>
            </div>
          )}

          {/* Participant waiting */}
          {!isAdmin && (
            <div className="text-center pb-6" style={{ animation: 'lb-slide-in 0.4s 0.4s both' }}>
              <p
                className="text-white text-lg sm:text-xl md:text-2xl font-semibold"
                style={{ animation: 'lb-shimmer 2.5s ease-in-out infinite' }}
              >
                {isFinalLeaderboard ? '🏆 Waiting for final results...' : '⏳ Waiting for next question...'}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Leaderboard;