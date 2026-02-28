import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Star, ArrowRight, TrendingUp, Medal, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { useSocket } from '../context/SocketContext';
import { API_BASE_URL } from '../config';

const API = `${API_BASE_URL}/api`;

/* Marquee-scrolling name for long strings on small screens */
const ScrollingName = ({ name, isCurrentPlayer }) => {
  const displayName = `${name}${isCurrentPlayer ? ' (You)' : ''}`;
  const isLong = displayName.length > 16;

  return (
    <div className="overflow-hidden max-w-full" style={{ maskImage: isLong ? 'linear-gradient(to right, black 80%, transparent 100%)' : 'none' }}>
      <motion.h3
        className="text-base sm:text-lg md:text-xl font-bold text-white whitespace-nowrap"
        title={displayName}
        animate={isLong ? { x: ['0%', '-60%', '-60%', '0%'] } : {}}
        transition={isLong ? { duration: 5, repeat: Infinity, ease: 'linear', times: [0, 0.45, 0.9, 1] } : {}}
      >
        {displayName}
      </motion.h3>
    </div>
  );
};

const Leaderboard = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const questionNumber = parseInt(searchParams.get('qnum') || '1', 10);
  const totalParam = parseInt(searchParams.get('total') || '0', 10);
  const finalFlag = searchParams.get('final');

  const [leaderboard, setLeaderboard] = useState([]);
  const [rankChanges, setRankChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const { socket, isConnected, connect, send, addListener } = useSocket();

  const [totalQuestions, setTotalQuestions] = useState(totalParam);

  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const participantId = localStorage.getItem('participantId');

  const isFinalLeaderboard = finalFlag === '1' || (totalQuestions > 0 && questionNumber >= totalQuestions);

  useEffect(() => {
    fetchResults();
    setTimeout(() => confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchResults = async () => {
    try {
      const [leaderboardRes, quizRes] = await Promise.all([
        axios.get(`${API}/leaderboard/${code}`),
        axios.get(`${API}/quiz/${code}/info`)
      ]);

      const newLeaderboard = leaderboardRes.data;
      setLeaderboard(newLeaderboard);
      if (totalParam === 0 && quizRes.data.questionsCount) {
        setTotalQuestions(quizRes.data.questionsCount);
      }
      setLoading(false);

      try {
        const prevKey = `leaderboard_${code}`;
        const prevData = sessionStorage.getItem(prevKey);
        if (prevData) {
          const prevRanks = JSON.parse(prevData);
          const changes = {};
          newLeaderboard.forEach((entry, idx) => {
            const currentRank = idx + 1;
            const prevRank = prevRanks[entry.participantId];
            if (prevRank !== undefined && prevRank !== currentRank) {
              changes[entry.participantId] = prevRank - currentRank;
            }
          });
          setRankChanges(changes);
        }
        const currentRanks = {};
        newLeaderboard.forEach((entry, idx) => { currentRanks[entry.participantId] = idx + 1; });
        sessionStorage.setItem(prevKey, JSON.stringify(currentRanks));
      } catch { /* ignore */ }

    } catch {
      toast.error('Failed to load leaderboard');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isConnected) connect(code, participantId || null, isAdmin);
  }, [isConnected, code, participantId, isAdmin, connect]);

  useEffect(() => {
    if (!socket) return;

    const off1 = addListener('next_question', () => navigate(`/quiz/${code}`));
    const off2 = addListener('show_podium', () => navigate(`/podium/${code}`));
    const off3 = addListener('quiz_ended', () => {
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

    return () => { off1(); off2(); off3(); off4(); };
  }, [socket, addListener, navigate, code, isAdmin, participantId]);

  const handleNext = () => { if (socket) send({ type: 'next_question' }); };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-8 border-yellow-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 relative overflow-hidden">
      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <motion.div key={i} className="absolute w-2 h-2 rounded-full"
            style={{ background: ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#95E1D3'][i % 5] }}
            initial={{ x: Math.random() * 1920, y: -20, scale: Math.random() * 0.5 + 0.5 }}
            animate={{ y: 1100, rotate: Math.random() * 360 }}
            transition={{ duration: Math.random() * 5 + 5, repeat: Infinity, delay: Math.random() * 5, ease: 'linear' }} />
        ))}
      </div>

      <div className="relative z-10 min-h-screen p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', duration: 1 }} className="text-center mb-6 md:mb-8">
            <motion.div animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }} className="inline-block mb-4">
              <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-2xl">
                <BarChart3 className="w-9 h-9 md:w-14 md:h-14 text-white" />
              </div>
            </motion.div>

            <motion.h1 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
              className="text-4xl sm:text-5xl md:text-7xl font-black text-white mb-2 drop-shadow-lg" style={{ fontFamily: "'Fredoka', sans-serif" }}>
              {isFinalLeaderboard ? 'Final Standings!' : 'Leaderboard'}
            </motion.h1>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-base sm:text-xl md:text-2xl text-white/90 font-semibold px-2">
              {isFinalLeaderboard
                ? `Quiz Complete! ${leaderboard.length} players competed`
                : `After Question ${questionNumber} of ${totalQuestions}`}
            </motion.p>
          </motion.div>

          {/* Leaderboard list */}
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-3 sm:p-4 md:p-8 border-2 border-white/20 mb-6 md:mb-8">
            <div className="space-y-2 sm:space-y-3">
              <AnimatePresence>
                {leaderboard.map((entry, index) => {
                  const isCurrentPlayer = entry.participantId === participantId;
                  const rank = entry.rank || (index + 1);
                  const isTop3 = rank <= 3;
                  const change = rankChanges[entry.participantId];

                  return (
                    <motion.div key={entry.participantId}
                      initial={{ x: -100, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.05, type: 'spring' }}
                      className={`relative overflow-hidden rounded-2xl shadow-lg transition-all duration-300 hover:scale-[1.02]
                        ${isCurrentPlayer
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500 ring-4 ring-yellow-300 scale-[1.02]'
                          : isTop3
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                          : 'bg-white/20 backdrop-blur-sm'}`}>

                      {/* RESPONSIVE CARD LAYOUT */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 md:p-5">

                        {/* Rank badge */}
                        <div className={`flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black text-base md:text-2xl
                          ${isTop3
                            ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-xl'
                            : 'bg-white text-gray-700'}`}>
                          {rank === 1 && <Crown className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                          {rank === 2 && <Medal className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                          {rank === 3 && <Star className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7" />}
                          {rank > 3 && <span className="text-sm sm:text-base md:text-xl">{rank}</span>}
                        </div>

                        {/* Avatar */}
                        <motion.div whileHover={{ scale: 1.1, rotate: 5 }} className="flex-shrink-0">
                          <DicebearAvatar
                            seed={entry.avatarSeed}
                            size="md"
                            className="w-9 h-9 sm:w-12 sm:h-12 md:w-16 md:h-16 ring-2 md:ring-4 ring-white/50 shadow-xl"
                          />
                        </motion.div>

                        {/* Name + time — flex-1 so it fills space; wraps to next line only when truly squeezed */}
                        <div className="flex-1 min-w-[80px] min-w-0 overflow-hidden">
                          {/* Name row with rank-change badge */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="flex-1 min-w-0">
                              <ScrollingName name={entry.name} isCurrentPlayer={isCurrentPlayer} />
                            </div>

                            {/* Rank change pill */}
                            {change !== undefined && change !== 0 && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: index * 0.05 + 0.3, type: 'spring' }}
                                className={`flex-shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold
                                  ${change > 0 ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                                {change > 0
                                  ? <><ChevronUp className="w-3 h-3" />{change}</>
                                  : <><ChevronDown className="w-3 h-3" />{Math.abs(change)}</>}
                              </motion.div>
                            )}
                          </div>

                          {/* Time sub-row */}
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

                      {/* Shimmer overlay for current player */}
                      {isCurrentPlayer && (
                        <motion.div
                          className="absolute inset-0 bg-white/20 pointer-events-none"
                          animate={{ opacity: [0.2, 0, 0.2] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}

                      {/* Trophy for rank 1 */}
                      {rank === 1 && (
                        <motion.div
                          animate={{ y: [0, -5, 0], rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute top-2 right-2 pointer-events-none">
                          <Trophy className="w-5 h-5 md:w-8 md:h-8 text-yellow-300" />
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Admin controls */}
          {isAdmin && (
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="text-center pb-6">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button onClick={handleNext} size="lg"
                  className="bg-white text-purple-600 hover:bg-gray-100 font-black text-xl sm:text-2xl md:text-3xl px-8 sm:px-12 md:px-16 py-5 sm:py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-3 sm:gap-4 mx-auto"
                  style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  {isFinalLeaderboard
                    ? <><Trophy className="w-7 h-7 md:w-10 md:h-10" />Show Winners</>
                    : <>Next Question<ArrowRight className="w-7 h-7 md:w-10 md:h-10" /></>}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Participant waiting */}
          {!isAdmin && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center pb-6">
              <motion.p animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="text-white text-lg sm:text-xl md:text-2xl font-semibold">
                {isFinalLeaderboard ? '🏆 Waiting for final results...' : '⏳ Waiting for next question...'}
              </motion.p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;