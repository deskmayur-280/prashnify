import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Trophy, Target, Clock, TrendingUp, Check, X, Share2, ArrowLeft, Star, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { generateResultCard } from '@/utils/generateResultCard';
import { API_BASE_URL } from '../config';

const API = `${API_BASE_URL}/api`;

// Floating particle component
const Particle = ({ color, size, x, y, delay, duration }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{ background: color, width: size, height: size, left: `${x}%`, top: `${y}%` }}
    initial={{ opacity: 0, scale: 0 }}
    animate={{
      opacity: [0, 0.7, 0],
      scale: [0, 1, 0.5],
      y: [0, -60, -120],
      x: [0, Math.random() * 40 - 20],
    }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeOut' }}
  />
);

// Rank badge with medal colors
const getRankStyle = (rank) => {
  if (rank === 1) return { bg: 'from-yellow-400 to-orange-400', text: 'text-yellow-900', glow: '#FFD700', label: '🥇 Champion' };
  if (rank === 2) return { bg: 'from-gray-300 to-gray-500', text: 'text-gray-900', glow: '#C0C0C0', label: '🥈 Runner-up' };
  if (rank === 3) return { bg: 'from-orange-400 to-orange-600', text: 'text-orange-900', glow: '#CD7F32', label: '🥉 Third Place' };
  return { bg: 'from-purple-500 to-indigo-600', text: 'text-white', glow: '#9D00FF', label: `#${rank} Place` };
};

const MyResults = () => {
  const { code, participantId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    axios.get(`${API}/quiz/${code}/my-results/${participantId}`)
      .then(res => {
        setData(res.data);
        setLoading(false);
        setTimeout(() => setShowConfetti(true), 500);
      })
      .catch(() => { toast.error('Failed to load results'); setLoading(false); });
  }, [code, participantId]);

  const handleShare = async () => {
    if (!data) return;
    try {
      const imgData = await generateResultCard({
        name: data.name,
        rank: data.rank,
        score: data.score,
        accuracy: data.accuracy,
        quizTitle: `Prashnify`,
        totalPlayers: data.totalPlayers
      });

      if (navigator.share) {
        const blob = await (await fetch(imgData)).blob();
        const file = new File([blob], 'my-results.png', { type: 'image/png' });
        navigator.share({ files: [file], title: 'My Quiz Results' }).catch(() => {});
      } else {
        const link = document.createElement('a');
        link.download = 'my-quiz-results.png';
        link.href = imgData;
        link.click();
        toast.success('Image downloaded!');
      }
    } catch {
      toast.error('Failed to generate share card');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #0a2744 100%)' }}>
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 border-4 border-t-transparent rounded-full mx-auto mb-4"
            style={{ borderColor: '#9D00FF', borderTopColor: 'transparent' }}
          />
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-purple-300 font-semibold"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
          >
            Loading your results...
          </motion.p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #0a2744 100%)' }}>
        <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center shadow-xl max-w-md border border-white/20">
          <p className="text-xl font-bold text-white">No results found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-6 py-3 rounded-full font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #9D00FF, #FF0055)' }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const percentile = data.totalPlayers > 1
    ? Math.round(((data.totalPlayers - data.rank) / (data.totalPlayers - 1)) * 100)
    : 100;

  const rankStyle = getRankStyle(data.rank);

  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    color: ['#FF6B00', '#FF0055', '#9D00FF', '#00FF94', '#FFD700'][i % 5],
    size: Math.random() * 8 + 4,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 3,
    duration: Math.random() * 3 + 3,
  }));

  return (
    <div className="min-h-screen relative overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 60%, #0a2744 100%)' }}>

      {/* Ambient glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: '#9D00FF' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl"
          style={{ background: '#FF6B00' }} />
        <div className="absolute top-1/2 left-0 w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{ background: '#FF0055' }} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {showConfetti && particles.map(p => <Particle key={p.id} {...p} />)}
      </div>

      <div className="relative z-10 min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto">

          {/* Back button */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <button
              onClick={() => navigate(`/podium/${code}`)}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-6 group"
            >
              <motion.span whileHover={{ x: -3 }} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Podium</span>
              </motion.span>
            </button>
          </motion.div>

          {/* Hero header card */}
          <motion.div
            initial={{ y: -40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="rounded-3xl p-6 md:p-8 shadow-2xl text-center mb-6 relative overflow-hidden border border-white/10"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(157,0,255,0.12) 100%)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Rank badge top */}
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: 'spring' }}
              className="inline-block mb-4"
            >
              <div
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-black bg-gradient-to-r ${rankStyle.bg} ${rankStyle.text}`}
                style={{ boxShadow: `0 0 20px ${rankStyle.glow}60` }}
              >
                {rankStyle.label}
              </div>
            </motion.div>

            {/* Avatar with pulsing ring */}
            <motion.div
              className="inline-block mb-4 relative"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ background: rankStyle.glow, filter: 'blur(8px)' }}
              />
              <DicebearAvatar seed={data.avatarSeed} size="xl"
                className="relative ring-4 shadow-xl"
                style={{ '--tw-ring-color': rankStyle.glow }} />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-3xl md:text-4xl font-black text-white mb-1"
              style={{ fontFamily: 'Fredoka, sans-serif' }}
            >
              {data.name}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-yellow-400" />
              <p className="font-bold text-base" style={{ color: '#00FF94' }}>
                You beat {percentile}% of players!
              </p>
              <Zap className="w-4 h-4 text-yellow-400" />
            </motion.div>
          </motion.div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: <Trophy className="w-6 h-6" />, iconColor: '#FFD700', label: 'Rank', value: `#${data.rank}`, sub: `of ${data.totalPlayers}`, glow: '#FFD70040' },
              { icon: <TrendingUp className="w-6 h-6" />, iconColor: '#00FF94', label: 'Score', value: data.score, sub: 'points', glow: '#00FF9440' },
              { icon: <Target className="w-6 h-6" />, iconColor: '#FF6B00', label: 'Accuracy', value: `${data.accuracy}%`, sub: `${data.correctAnswers}/${data.totalQuestions}`, glow: '#FF6B0040' },
              { icon: <Clock className="w-6 h-6" />, iconColor: '#9D00FF', label: 'Avg Time', value: `${data.averageTimePerQuestion}s`, sub: 'per question', glow: '#9D00FF40' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.1, type: 'spring' }}
                whileHover={{ scale: 1.05, y: -4 }}
                className="rounded-2xl p-4 text-center relative overflow-hidden border border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: `0 0 20px ${stat.glow}`,
                }}
              >
                <div className="mb-2 flex justify-center" style={{ color: stat.iconColor }}>
                  {stat.icon}
                </div>
                <div className="text-2xl font-black text-white">{stat.value}</div>
                <div className="text-xs font-bold mt-0.5" style={{ color: stat.iconColor, opacity: 0.9 }}>{stat.label}</div>
                <div className="text-xs text-white/40">{stat.sub}</div>
              </motion.div>
            ))}
          </div>

          {/* Accuracy ring */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-3xl p-6 shadow-lg mb-6 flex items-center justify-center gap-6 border border-white/10"
            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
          >
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                  fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <motion.path
                  d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                  fill="none"
                  stroke={data.accuracy >= 70 ? '#00FF94' : data.accuracy >= 40 ? '#FF6B00' : '#FF0055'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ strokeDasharray: '0, 100' }}
                  animate={{ strokeDasharray: `${data.accuracy}, 100` }}
                  transition={{ duration: 1.5, delay: 0.6 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-white">{data.accuracy}%</span>
              </div>
            </div>
            <div>
              <div className="text-lg font-black text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                Overall Accuracy
              </div>
              <div className="text-sm text-white/50 mt-1">
                {data.correctAnswers} correct out of {data.totalQuestions} questions
              </div>
              {/* Mini accuracy bar */}
              <div className="mt-3 h-2 rounded-full overflow-hidden w-40" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: data.accuracy >= 70
                      ? 'linear-gradient(90deg, #00FF94, #00cc76)'
                      : data.accuracy >= 40
                      ? 'linear-gradient(90deg, #FF6B00, #FF0055)'
                      : 'linear-gradient(90deg, #FF0055, #9D00FF)'
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${data.accuracy}%` }}
                  transition={{ duration: 1.5, delay: 0.8 }}
                />
              </div>
            </div>
          </motion.div>

          {/* Question breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="rounded-3xl p-6 shadow-lg mb-6 border border-white/10"
            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                Question Breakdown
              </h3>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {data.answers.map((answer, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.8 + idx * 0.04, type: 'spring', stiffness: 200 }}
                    whileHover={{ x: 4, scale: 1.01 }}
                    className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                    style={{
                      background: answer.isCorrect
                        ? 'rgba(0, 255, 148, 0.08)'
                        : 'rgba(255, 0, 85, 0.08)',
                      borderColor: answer.isCorrect
                        ? 'rgba(0, 255, 148, 0.25)'
                        : 'rgba(255, 0, 85, 0.25)',
                    }}
                  >
                    <motion.div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: answer.isCorrect
                          ? 'linear-gradient(135deg, #00FF94, #00cc76)'
                          : 'linear-gradient(135deg, #FF0055, #cc0044)',
                      }}
                      animate={answer.isCorrect ? { scale: [1, 1.15, 1] } : {}}
                      transition={{ duration: 0.5, delay: 0.9 + idx * 0.04 }}
                    >
                      {answer.isCorrect
                        ? <Check className="w-4 h-4 text-white" />
                        : <X className="w-4 h-4 text-white" />}
                    </motion.div>

                    <div className="flex-1">
                      <span className="text-sm font-black text-white">Q{answer.questionIndex + 1}</span>
                      <span className="text-xs text-white/40 ml-2 flex-shrink-0">
                        ⏱ {answer.timeTaken}s
                      </span>
                    </div>

                    <div className="text-sm font-black"
                      style={{ color: answer.isCorrect ? '#00FF94' : '#FF0055' }}>
                      +{answer.points} pts
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Share / actions — FIXED buttons */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex flex-col sm:flex-row gap-3 justify-center pb-8"
          >
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black text-white text-base shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #FF6B00, #FF0055)',
                boxShadow: '0 0 30px rgba(255, 107, 0, 0.4)',
                fontFamily: 'Fredoka, sans-serif',
              }}
            >
              <Share2 className="w-5 h-5" />
              Share Results
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black text-white text-base border-2 transition-all"
              style={{
                background: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.25)',
                fontFamily: 'Fredoka, sans-serif',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >
              🏠 Home
            </motion.button>
          </motion.div>

        </div>
      </div>
    </div>
  );
};

export default MyResults;