import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Trophy, Target, Clock, TrendingUp, Check, X, Share2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { generateResultCard } from '@/utils/generateResultCard';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const MyResults = () => {
  const { code, participantId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/quiz/${code}/my-results/${participantId}`)
      .then(res => { setData(res.data); setLoading(false); })
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
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-8 border-yellow-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center shadow-xl max-w-md">
          <p className="text-xl font-bold text-gray-800">No results found</p>
          <Button onClick={() => navigate('/')} className="mt-4">Go Home</Button>
        </div>
      </div>
    );
  }

  const percentile = data.totalPlayers > 1
    ? Math.round(((data.totalPlayers - data.rank) / (data.totalPlayers - 1)) * 100)
    : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Button variant="ghost" onClick={() => navigate(`/podium/${code}`)}
            className="text-white/80 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Podium
          </Button>
        </motion.div>

        {/* Header card */}
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl text-center mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-blue-50 opacity-50" />
          <div className="relative z-10">
            <motion.div whileHover={{ scale: 1.1, rotate: 5 }} className="inline-block mb-4">
              <DicebearAvatar seed={data.avatarSeed} size="xl" className="ring-4 ring-purple-200 shadow-xl" />
            </motion.div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-1" style={{ fontFamily: 'Fredoka,sans-serif' }}>{data.name}</h1>
            <p className="text-purple-600 font-semibold text-lg">You beat {percentile}% of players!</p>
          </div>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: <Trophy className="w-6 h-6 text-yellow-500" />, label: 'Rank', value: `#${data.rank}`, sub: `of ${data.totalPlayers}` },
            { icon: <TrendingUp className="w-6 h-6 text-green-500" />, label: 'Score', value: data.score, sub: 'points' },
            { icon: <Target className="w-6 h-6 text-blue-500" />, label: 'Accuracy', value: `${data.accuracy}%`, sub: `${data.correctAnswers}/${data.totalQuestions}` },
            { icon: <Clock className="w-6 h-6 text-orange-500" />, label: 'Avg Time', value: `${data.averageTimePerQuestion}s`, sub: 'per question' },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.2 + i * 0.1, type: 'spring' }}
              className="bg-white rounded-2xl p-4 shadow-lg text-center">
              <div className="mb-2 flex justify-center">{stat.icon}</div>
              <div className="text-2xl font-black text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 font-semibold">{stat.label}</div>
              <div className="text-xs text-gray-400">{stat.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Accuracy ring */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="bg-white rounded-3xl p-6 shadow-lg mb-6 flex items-center justify-center gap-6">
          <div className="relative w-28 h-28">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <motion.path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                fill="none" stroke={data.accuracy >= 70 ? '#10B981' : data.accuracy >= 40 ? '#F59E0B' : '#EF4444'}
                strokeWidth="3" strokeLinecap="round"
                initial={{ strokeDasharray: '0, 100' }}
                animate={{ strokeDasharray: `${data.accuracy}, 100` }}
                transition={{ duration: 1.5, delay: 0.6 }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-black text-gray-900">{data.accuracy}%</span>
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">Overall Accuracy</div>
            <div className="text-sm text-gray-500">{data.correctAnswers} correct out of {data.totalQuestions} questions</div>
          </div>
        </motion.div>

        {/* Question breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="bg-white rounded-3xl p-6 shadow-lg mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Question Breakdown</h3>
          <div className="space-y-3">
            <AnimatePresence>
              {data.answers.map((answer, idx) => (
                <motion.div key={idx}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.8 + idx * 0.05 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                    answer.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    answer.isCorrect ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {answer.isCorrect ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-gray-800">Q{answer.questionIndex + 1}</span>
                    <span className="text-xs text-gray-500 ml-2">{answer.timeTaken}s</span>
                  </div>
                  <div className="text-sm font-bold text-gray-700">+{answer.points} pts</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Share / actions */}
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }}
          className="flex gap-3 justify-center">
          <Button onClick={handleShare} className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full px-6 py-3 gap-2">
            <Share2 className="w-4 h-4" /> Share Results
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}
            className="rounded-full px-6 py-3 border-white/30 text-white hover:bg-white/10">
            Home
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default MyResults;
