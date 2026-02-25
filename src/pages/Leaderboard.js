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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const Leaderboard = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read qnum (1-indexed), total, and final flag from URL params
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

  // Use final flag from URL, or compute from question number vs total
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
      // Fallback total from API if not in URL
      if (totalParam === 0 && quizRes.data.questionsCount) {
        setTotalQuestions(quizRes.data.questionsCount);
      }
      setLoading(false);

      // Rank changes
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

    const off1 = addListener('next_question', () => {
      navigate(`/quiz/${code}`);
    });

    const off2 = addListener('show_podium', () => navigate(`/podium/${code}`));

    // Quiz ended by admin — redirect everyone
    const off3 = addListener('quiz_ended', () => {
      toast.info('📢 Quiz has been ended by the host');
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    });

    // Player was kicked
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

      <div className="relative z-10 min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', duration: 1 }} className="text-center mb-8">
            <motion.div animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }} className="inline-block mb-4">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-2xl">
                <BarChart3 className="w-12 h-12 md:w-14 md:h-14 text-white" />
              </div>
            </motion.div>

            <motion.h1 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
              className="text-5xl md:text-7xl font-black text-white mb-3 drop-shadow-lg" style={{ fontFamily: "'Fredoka', sans-serif" }}>
              {isFinalLeaderboard ? 'Final Standings!' : 'Leaderboard'}
            </motion.h1>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-xl md:text-2xl text-white/90 font-semibold">
              {isFinalLeaderboard
                ? `Quiz Complete! ${leaderboard.length} players competed`
                : `After Question ${questionNumber} of ${totalQuestions}`}
            </motion.p>
          </motion.div>

          {/* Leaderboard list */}
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-4 md:p-8 border-2 border-white/20 mb-8">
            <div className="space-y-3">
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
                      className={`relative overflow-hidden rounded-2xl p-4 md:p-6 shadow-lg transition-all duration-300 hover:scale-[1.02]
                        ${isCurrentPlayer ? 'bg-gradient-to-r from-yellow-400 to-orange-500 ring-4 ring-yellow-300 scale-105'
                          : isTop3 ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                          : 'bg-white/20 backdrop-blur-sm'}`}>

                      <div className="absolute -left-2 -top-2">
                        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black text-xl md:text-2xl
                          ${isTop3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-xl' : 'bg-white text-gray-700'}`}>
                          {rank === 1 && <Crown className="w-6 h-6 md:w-7 md:h-7" />}
                          {rank === 2 && <Medal className="w-6 h-6 md:w-7 md:h-7" />}
                          {rank === 3 && <Star className="w-6 h-6 md:w-7 md:h-7" />}
                          {rank > 3 && rank}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 md:gap-6 pl-10 md:pl-12">
                        <motion.div whileHover={{ scale: 1.1, rotate: 5 }} className="flex-shrink-0">
                          <DicebearAvatar seed={entry.avatarSeed} size="lg" className="ring-4 ring-white/50 shadow-xl" />
                        </motion.div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl md:text-2xl font-bold text-white truncate">
                              {entry.name}{isCurrentPlayer && ' (You)'}
                            </h3>
                            {change !== undefined && change !== 0 && (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ delay: index * 0.05 + 0.3, type: 'spring' }}
                                className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${change > 0 ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                                {change > 0 ? <><ChevronUp className="w-3 h-3" />{change}</> : <><ChevronDown className="w-3 h-3" />{Math.abs(change)}</>}
                              </motion.div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <TrendingUp className="w-4 h-4 text-white/80" />
                            <span className="text-sm text-white/80 font-semibold">{entry.totalTime.toFixed(1)}s</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 md:px-6 py-2 md:py-3 flex-shrink-0">
                          <Star className="w-5 h-5 md:w-6 md:h-6 text-yellow-300" />
                          <span className="text-2xl md:text-3xl font-black text-white">{entry.score}</span>
                        </div>
                      </div>

                      {isCurrentPlayer && <motion.div className="absolute inset-0 bg-white/20" animate={{ opacity: [0.2, 0, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />}
                      {rank === 1 && <motion.div animate={{ y: [0, -5, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}
                        className="absolute top-2 right-2"><Trophy className="w-6 h-6 md:w-8 md:h-8 text-yellow-300" /></motion.div>}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Admin controls */}
          {isAdmin && (
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button onClick={handleNext} size="lg"
                  className="bg-white text-purple-600 hover:bg-gray-100 font-black text-2xl md:text-3xl px-12 md:px-16 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-4 mx-auto"
                  style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  {isFinalLeaderboard ? <><Trophy className="w-8 h-8 md:w-10 md:h-10" />Show Winners</>
                    : <>Next Question<ArrowRight className="w-8 h-8 md:w-10 md:h-10" /></>}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Participant waiting */}
          {!isAdmin && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
              <motion.p animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="text-white text-xl md:text-2xl font-semibold">
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