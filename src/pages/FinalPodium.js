// FinalPodium.js
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Star, Home, BarChart3, XCircle, TrendingUp } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { useSocket } from '../context/SocketContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const FinalPodium = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  
  const [winners, setWinners] = useState([]);
  const [quizStats, setQuizStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [fullLeaderboard, setFullLeaderboard] = useState([]);

  const participantId = localStorage.getItem('participantId');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const myResult = fullLeaderboard.find(r => r.participantId === participantId);

  const { socket, isConnected, connect, addListener } = useSocket();

  // Connect WebSocket for live events
  useEffect(() => {
    if (!isConnected) connect(code, participantId || null, isAdmin);
  }, [isConnected, code, participantId, isAdmin, connect]);

  // Listen for quiz_ended and participant_kicked
  useEffect(() => {
    if (!socket) return;

    const off1 = addListener('quiz_ended', () => {
      toast.info('📢 Quiz has been ended');
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    });

    const off2 = addListener('participant_kicked', (d) => {
      if (!isAdmin && d.participantId === participantId) {
        localStorage.removeItem('participantId');
        localStorage.removeItem('participantName');
        toast.error('You have been removed from this quiz by the host');
        navigate('/');
      }
    });

    return () => { off1(); off2(); };
  }, [socket, addListener, navigate, isAdmin, participantId, code]);

  useEffect(() => {
    fetchResults();
    setTimeout(() => triggerMassiveConfetti(), 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchResults = async () => {
    try {
      const [resultsRes, leaderboardRes] = await Promise.all([
        axios.get(`${API}/quiz/${code}/final-results`),
        axios.get(`${API}/leaderboard/${code}`)
      ]);
      
      setWinners(resultsRes.data.winners);
      setQuizStats(resultsRes.data.stats);
      setFullLeaderboard(leaderboardRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Fetch final results error:', error);
      toast.error('Failed to load results');
      setLoading(false);
    }
  };

  const triggerMassiveConfetti = () => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      }));
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      }));
    }, 250);
  };

  const handleEndQuiz = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      await axios.patch(`${API}/admin/quiz/${code}/status?status=ended`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Quiz ended successfully');
      navigate('/admin');
    } catch (error) {
      console.error('End quiz error:', error);
      toast.error('Failed to end quiz');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-20 h-20 border-8 border-yellow-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(100)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              background: ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#95E1D3'][Math.floor(Math.random() * 5)]
            }}
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: -20,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{ 
              y: window.innerHeight + 20,
              rotate: Math.random() * 360
            }}
            transition={{ 
              duration: Math.random() * 5 + 5,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <div className="relative z-10 min-h-screen p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", duration: 1 }}
            className="text-center mb-8 md:mb-12"
          >
            <motion.div
              animate={{ 
                rotate: [0, -10, 10, -10, 0],
                scale: [1, 1.2, 1]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block mb-4 md:mb-6"
            >
              <div className="w-20 h-20 md:w-32 md:h-32 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-2xl">
                <Trophy className="w-12 h-12 md:w-20 md:h-20 text-white" />
              </div>
            </motion.div>
            
            <motion.h1 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.3 }}
              className="text-5xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-500 mb-3 md:mb-4 drop-shadow-lg"
              style={{ fontFamily: "'Fredoka', sans-serif" }}
            >
              Game Over!
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-2xl md:text-3xl text-white/90 font-semibold"
            >
              Final Results
            </motion.p>
          </motion.div>

          {winners.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-8 md:mb-12"
            >
              <div className="flex items-end justify-center gap-2 md:gap-8 mb-8 md:mb-12 px-2">
                {winners[1] && (
                  <motion.div
                    initial={{ y: 200, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, type: "spring" }}
                    className="flex flex-col items-center w-[30%] md:w-72"
                    style={{ transform: 'scale(0.85)' }}
                  >
                    <motion.div
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="mb-3 md:mb-6"
                    >
                      <DicebearAvatar 
                        seed={winners[1].avatarSeed || winners[1].name}
                        size="xl"
                        className="ring-4 ring-white/30 shadow-2xl w-16 h-16 md:w-24 md:h-24"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ delay: 0.8, duration: 0.8, type: 'spring' }}
                      className="w-full bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-2xl md:rounded-t-3xl p-3 md:p-8 shadow-2xl overflow-hidden"
                      style={{ minHeight: '160px' }}
                    >
                      <div className="text-center">
                        <div className="text-5xl md:text-9xl font-black text-white mb-1 md:mb-3">2</div>
                        <h3 className="text-base md:text-3xl font-bold text-white mb-1 md:mb-3 truncate">
                          {winners[1].name}
                        </h3>
                        <div className="bg-white/20 rounded-full px-2 md:px-6 py-1 md:py-3">
                          <div className="flex items-center justify-center gap-1 md:gap-2">
                            <Star className="w-3 h-3 md:w-6 md:h-6 text-yellow-200" />
                            <span className="text-base md:text-2xl font-black text-white">
                              {winners[1].score}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}

                {winners[0] && (
                  <motion.div
                    initial={{ y: 200, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring" }}
                    className="flex flex-col items-center w-[35%] md:w-80"
                  >
                    <motion.div
                      animate={{ 
                        y: [0, -20, 0],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="mb-3 md:mb-6 relative"
                    >
                      <motion.div
                        animate={{ 
                          scale: [1, 1.3, 1],
                          opacity: [0.3, 0.6, 0.3]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -inset-4 md:-inset-8 bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-400 rounded-full blur-2xl"
                      />
                      
                      <DicebearAvatar 
                        seed={winners[0].avatarSeed || winners[0].name}
                        size="2xl"
                        className="relative ring-4 md:ring-8 ring-yellow-300/50 shadow-2xl w-20 h-20 md:w-40 md:h-40"
                      />
                      
                      <motion.div
                        animate={{ 
                          rotate: [0, -10, 10, -10, 0],
                          y: [0, -5, 0]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -top-6 md:-top-12 left-1/2 transform -translate-x-1/2"
                      >
                        <Crown className="w-10 h-10 md:w-20 md:h-20 text-yellow-300 drop-shadow-2xl" />
                      </motion.div>
                    </motion.div>

                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ delay: 0.5, duration: 1, type: 'spring' }}
                      className="w-full bg-gradient-to-b from-yellow-400 to-orange-600 rounded-t-2xl md:rounded-t-3xl p-4 md:p-8 shadow-2xl relative overflow-hidden"
                      style={{ minHeight: '192px' }}
                    >
                      <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        style={{ width: '50%' }}
                      />
                      
                      <div className="text-center relative z-10">
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="text-6xl md:text-[10rem] font-black text-white mb-1 md:mb-3 drop-shadow-2xl leading-none"
                        >
                          1
                        </motion.div>
                        <h3 className="text-lg md:text-4xl font-bold text-white mb-2 md:mb-4 truncate drop-shadow-lg">
                          {winners[0].name}
                        </h3>
                        <div className="bg-white/40 backdrop-blur-sm rounded-full px-3 md:px-8 py-2 md:py-4 mb-1 md:mb-3">
                          <div className="flex items-center justify-center gap-1 md:gap-3">
                            <Star className="w-4 h-4 md:w-8 md:h-8 text-yellow-100" />
                            <span className="text-xl md:text-4xl font-black text-white">
                              {winners[0].score}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}

                {winners[2] && (
                  <motion.div
                    initial={{ y: 200, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="flex flex-col items-center w-[30%] md:w-72"
                    style={{ transform: 'scale(0.85)' }}
                  >
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                      className="mb-3 md:mb-6"
                    >
                      <DicebearAvatar 
                        seed={winners[2].avatarSeed || winners[2].name}
                        size="xl"
                        className="ring-4 ring-white/30 shadow-2xl w-16 h-16 md:w-24 md:h-24"
                      />
                    </motion.div>

                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ delay: 1.0, duration: 0.7, type: 'spring' }}
                      className="w-full bg-gradient-to-b from-orange-400 to-orange-600 rounded-t-2xl md:rounded-t-3xl p-3 md:p-8 shadow-2xl overflow-hidden"
                      style={{ minHeight: '128px' }}
                    >
                      <div className="text-center">
                        <div className="text-5xl md:text-9xl font-black text-white mb-1 md:mb-3">3</div>
                        <h3 className="text-base md:text-3xl font-bold text-white mb-1 md:mb-3 truncate">
                          {winners[2].name}
                        </h3>
                        <div className="bg-white/20 rounded-full px-2 md:px-6 py-1 md:py-3">
                          <div className="flex items-center justify-center gap-1 md:gap-2">
                            <Star className="w-3 h-3 md:w-6 md:h-6 text-yellow-200" />
                            <span className="text-base md:text-2xl font-black text-white">
                              {winners[2].score}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {participantId && !localStorage.getItem('isAdmin') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              className="text-center mb-8 text-white/80">
              {myResult ? (
                <p className="text-xl md:text-2xl font-semibold">You finished <span className="text-yellow-400 font-black text-2xl md:text-4xl px-2">#{myResult.rank}</span> with {myResult.score} points</p>
              ) : null}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="flex flex-col sm:flex-row gap-4 md:gap-6 justify-center items-center"
          >
            <Button
              onClick={() => setShowStatsDialog(true)}
              size="lg"
              className="bg-blue-600 text-white hover:bg-blue-700 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
              style={{ fontFamily: "'Fredoka', sans-serif" }}
            >
              <BarChart3 className="w-6 h-6 md:w-8 md:h-8" />
              Quiz Stats
            </Button>

            <Button
              onClick={() => navigate('/')}
              size="lg"
              className="bg-white text-purple-600 hover:bg-gray-100 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
              style={{ fontFamily: "'Fredoka', sans-serif" }}
            >
              <Home className="w-6 h-6 md:w-8 md:h-8" />
              Back to Home
            </Button>

            {localStorage.getItem('participantId') && !localStorage.getItem('isAdmin') && (
              <Button
                onClick={() => navigate(`/results/${code}/${localStorage.getItem('participantId')}`)}
                size="lg"
                className="bg-blue-500 text-white hover:bg-blue-600 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
                style={{ fontFamily: "'Fredoka', sans-serif" }}
              >
                <BarChart3 className="w-6 h-6 md:w-8 md:h-8" />
                View My Stats
              </Button>
            )}

            <Button
              onClick={() => navigate(`/leaderboard/${code}?qnum=999&total=999&final=1`)}
              size="lg"
              className="bg-indigo-600 text-white hover:bg-indigo-700 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
              style={{ fontFamily: "'Fredoka', sans-serif" }}
            >
              <Trophy className="w-6 h-6 md:w-8 md:h-8" />
              View Full Leaderboard
            </Button>

            {localStorage.getItem('isAdmin') === 'true' && (
              <Button
                onClick={handleEndQuiz}
                size="lg"
                className="bg-red-600 text-white hover:bg-red-700 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
                style={{ fontFamily: "'Fredoka', sans-serif" }}
              >
                <XCircle className="w-6 h-6 md:w-8 md:h-8" />
                End Quiz
              </Button>
            )}
          </motion.div>
        </div>
      </div>

      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-purple-600" />
              Quiz Statistics
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {quizStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-purple-600">{quizStats.totalParticipants}</div>
                  <div className="text-sm text-gray-600 mt-1">Players</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-blue-600">{quizStats.totalQuestions}</div>
                  <div className="text-sm text-gray-600 mt-1">Questions</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-green-600">{quizStats.averageScore}</div>
                  <div className="text-sm text-gray-600 mt-1">Avg Score</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-orange-600">{quizStats.completionRate}%</div>
                  <div className="text-sm text-gray-600 mt-1">Completed</div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-500" />
                Full Leaderboard
              </h3>
              <div className="space-y-2">
                {fullLeaderboard.map((entry, index) => (
                  <div
                    key={entry.participantId}
                    className={`flex items-center gap-4 p-4 rounded-lg ${
                      index < 3 
                        ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${
                      index === 0 ? 'bg-yellow-400 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-400 text-white' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>

                    <DicebearAvatar 
                      seed={entry.avatarSeed}
                      size="md"
                      className="shadow-md"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{entry.name}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <TrendingUp className="w-4 h-4" />
                        <span>{entry.totalTime.toFixed(1)}s</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm">
                      <Star className="w-5 h-5 text-yellow-500" />
                      <span className="text-xl font-black text-gray-900">{entry.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinalPodium;