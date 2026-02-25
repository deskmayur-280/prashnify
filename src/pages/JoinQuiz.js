// frontend/src/pages/JoinQuiz.js
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { LogIn, ArrowLeft, Sparkles, Shuffle, Users, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import {
  generateRandomSeed,
  saveAvatarSeed,
  getStoredAvatarSeed
} from '@/utils/avatar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const JoinQuiz = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code');

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [quizCode, setQuizCode] = useState(codeFromUrl || '');
  const [avatarSeed, setAvatarSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [quizPreview, setQuizPreview] = useState(null);

  useEffect(() => {
    const stored = getStoredAvatarSeed();
    if (stored) {
      setAvatarSeed(stored);
    } else {
      const newSeed = generateRandomSeed();
      setAvatarSeed(newSeed);
      saveAvatarSeed(newSeed);
    }
  }, []);

  // If code is in URL, auto-verify
  useEffect(() => {
    if (codeFromUrl) {
      verifyCode(codeFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  const verifyCode = async (codeToVerify) => {
    const code = (codeToVerify || quizCode).trim().toUpperCase();
    if (!code) {
      toast.error('Please enter a quiz code');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/quiz/${code}/verify`);
      setQuizPreview(res.data);
      setQuizCode(code);
      setStep(2);
    } catch (e) {
      if (e.response?.status === 404) toast.error('Invalid PIN — quiz not found');
      else if (e.response?.status === 400) toast.error(e.response.data.detail || 'Quiz unavailable');
      else toast.error('Could not connect. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    await verifyCode();
  };

  const handleRandomizeAvatar = () => {
    const newSeed = generateRandomSeed();
    setAvatarSeed(newSeed);
    saveAvatarSeed(newSeed);
    toast.success('🎲 Avatar randomized!');
  };

  const handleJoin = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API}/join`, {
        name: name.trim(),
        quizCode: quizCode.trim().toUpperCase(),
        avatarSeed: avatarSeed
      });

      localStorage.setItem('participantId', response.data.id);
      localStorage.setItem('participantName', response.data.name);
      localStorage.setItem('avatarSeed', response.data.avatarSeed);
      localStorage.removeItem('isAdmin');

      toast.success('Joined successfully!');
      navigate(`/lobby/${quizCode.toUpperCase()}`);
    } catch (error) {
      console.error('Join error:', error);
      const msg = error.response?.data?.error || 'Failed to join quiz';
      toast.error(msg);

      if (msg.includes('avatar') || msg.includes('unique')) {
        handleRandomizeAvatar();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>

      {/* Subtle particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(25)].map((_, i) => (
          <motion.div key={i} className="absolute w-1 h-1 bg-purple-500/30 rounded-full"
            initial={{ x: Math.random() * 1920, y: Math.random() * 1080 }}
            animate={{ x: Math.random() * 1920, y: Math.random() * 1080 }}
            transition={{ duration: Math.random() * 20 + 10, repeat: Infinity, repeatType: 'reverse' }} />
        ))}
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4 md:p-6">
        <Button
          variant="ghost"
          onClick={() => step === 1 ? navigate('/') : setStep(1)}
          className="absolute top-4 left-4 text-gray-400 hover:text-white hover:bg-white/10">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </Button>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="step1"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md">

              <motion.div animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }} className="text-center mb-8">
                <Sparkles className="w-16 h-16 text-yellow-300 mx-auto" />
              </motion.div>

              <div className="rounded-2xl p-6 md:p-8"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(124,58,237,0.3)', backdropFilter: 'blur(20px)' }}>
                <h1 className="text-4xl md:text-5xl font-bold mb-2 text-center text-white"
                  style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  Join Quiz
                </h1>
                <p className="text-gray-400 text-center mb-8 text-lg">Enter the game PIN to start</p>

                <form onSubmit={handleCodeSubmit} className="space-y-6">
                  <div>
                    <input
                      type="text"
                      value={quizCode}
                      onChange={(e) => setQuizCode(e.target.value.toUpperCase())}
                      placeholder="GAME PIN"
                      maxLength={6}
                      className="w-full rounded-2xl px-6 py-5 text-3xl font-bold text-white text-center tracking-widest outline-none focus:ring-2 focus:ring-purple-500/50 placeholder:text-white/30"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(124,58,237,0.3)' }}
                      autoFocus
                    />
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <button type="submit" disabled={loading || !quizCode.trim()}
                      className="w-full py-4 rounded-full text-xl font-black text-white disabled:opacity-50 transition-all"
                      style={{ fontFamily: 'Fredoka, sans-serif', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}>
                      {loading ? (
                        <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                      ) : 'Continue'}
                    </button>
                  </motion.div>
                </form>
              </div>
            </motion.div>
          ) : (
            <motion.div key="step2"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl">

              {/* Quiz preview card */}
              {quizPreview && (
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  className="mb-6 rounded-2xl p-4 text-center"
                  style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                    {quizPreview.title}
                  </h3>
                  <div className="flex items-center justify-center gap-4 mt-2 text-sm text-purple-300">
                    <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" />{quizPreview.questionsCount} questions</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{quizPreview.participantCount} joined</span>
                  </div>
                </motion.div>
              )}

              <div className="rounded-2xl p-6 md:p-8"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(124,58,237,0.3)', backdropFilter: 'blur(20px)' }}>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 text-center text-white"
                  style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  Who are you?
                </h1>
                <p className="text-gray-400 text-center mb-8">Choose your name and avatar</p>

                <form onSubmit={handleJoin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-2">Your Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full rounded-xl px-5 py-4 text-lg font-semibold text-white outline-none focus:ring-2 focus:ring-purple-500/50 placeholder:text-white/30"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(124,58,237,0.3)' }}
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-3">Your Avatar</label>
                    <div className="flex flex-col items-center gap-4">
                      <motion.div whileHover={{ scale: 1.05 }} className="relative">
                        <DicebearAvatar seed={avatarSeed} size="2xl" className="ring-4 ring-purple-500/30 shadow-2xl" />
                      </motion.div>
                      <Button type="button" variant="ghost" onClick={handleRandomizeAvatar}
                        className="text-purple-400 hover:text-white hover:bg-white/10 border border-purple-500/30 gap-2">
                        <Shuffle className="w-4 h-4" /> 🎲 Randomize Avatar
                      </Button>
                      <p className="text-xs text-gray-500 text-center max-w-xs">Your avatar will be unique in this quiz</p>
                    </div>
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <button type="submit" disabled={loading || !name.trim() || !avatarSeed}
                      className="w-full py-4 rounded-full text-xl font-black text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      style={{ fontFamily: 'Fredoka, sans-serif', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}>
                      {loading ? (
                        <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <><LogIn className="w-6 h-6" /> Join Game</>
                      )}
                    </button>
                  </motion.div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default JoinQuiz;