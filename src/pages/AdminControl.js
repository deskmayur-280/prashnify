import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import {
  Trophy, Users, Copy, Share2, QrCode, Play,
  Sparkles, LogOut, Crown, Clock, UserX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { useSocket } from '../context/SocketContext';
import { sounds } from '@/utils/sounds';
import { bgMusic } from '@/utils/bgMusic';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const AdminControl = () => {
  const { code } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  const { socket, isConnected, connect, send, addListener } = useSocket();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizState, setQuizState] = useState('lobby');
  const [answeredCount, setAnsweredCount] = useState(0);

  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const questionStartRef = useRef(null);
  const timeLimitRef = useRef(30);
  const mountedRef = useRef(true);

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/join?code=${code}`)}`;
  const joinUrl = `${window.location.origin}/join?code=${code}`;

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimeLeft(0);
  }, []);

  const startAdminTimer = useCallback((serverStartTime, timeLimit) => {
    stopTimer();
    questionStartRef.current = serverStartTime;
    timeLimitRef.current = timeLimit;

    const tick = () => {
      const elapsed = (Date.now() - questionStartRef.current) / 1000;
      const remaining = Math.max(0, timeLimitRef.current - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0) stopTimer();
    };

    tick();
    timerRef.current = setInterval(tick, 500);
  }, [stopTimer]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    toast.success('📋 Game PIN copied!');
    confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
  }, [code]);

  const copyJoinLink = useCallback(() => {
    navigator.clipboard.writeText(joinUrl);
    toast.success('🔗 Join link copied!');
  }, [joinUrl]);

  const shareQuiz = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: quiz?.title, text: `Join my quiz! Game PIN: ${code}`, url: joinUrl });
      } catch (err) {
        if (err.name !== 'AbortError') { copyJoinLink(); }
      }
    } else {
      copyJoinLink();
    }
  }, [quiz, code, joinUrl, copyJoinLink]);

  const fetchQuizDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await axios.get(`${API}/admin/quiz/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mountedRef.current) {
        setQuiz(res.data);
        setTotalQuestions(res.data.questions?.length || 0);
        setLoading(false);
      }
    } catch {
      toast.error('Failed to load quiz');
      navigate('/admin');
    }
  }, [code, navigate]);

  const fetchParticipants = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await axios.get(`${API}/admin/quiz/${code}/participants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mountedRef.current && res.data.participants) {
        setParticipants(res.data.participants);
      }
    } catch { /* silent */ }
  }, [code]);

  useEffect(() => {
    mountedRef.current = true;
    localStorage.setItem('isAdmin', 'true');
    fetchQuizDetails();
    fetchParticipants();
    connect(code, null, true);
    bgMusic.startLobby();
    const poll = setInterval(fetchParticipants, 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(poll);
      stopTimer();
      bgMusic.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!socket) return;

    const off1 = addListener('participant_joined', (data) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === data.participant.id)) return prev;
        confetti({ particleCount: 30, spread: 40, origin: { x: Math.random(), y: 0.6 } });
        sounds.lobbyJoin();
        toast.success(`${data.participant.name} joined! 🎉`);
        return [...prev, data.participant];
      });
    });

    const off2 = addListener('all_participants', (data) => {
      if (data.participants) setParticipants(data.participants);
      if (data.current_question !== undefined) setCurrentQuestionIndex(data.current_question);
      if (data.total_questions !== undefined) setTotalQuestions(data.total_questions);
      if (data.quiz_state) setQuizState(data.quiz_state);
    });

    const off3 = addListener('avatar_updated', (data) => {
      setParticipants(prev => prev.map(p =>
        p.id === data.participantId ? { ...p, avatarSeed: data.avatarSeed } : p
      ));
    });

    const off4 = addListener('answer_count', (data) => {
      setAnsweredCount(data.answeredCount ?? 0);
    });

    const off5 = addListener('sync_state', (data) => {
      if (data.current_question !== undefined) setCurrentQuestionIndex(data.current_question);
      if (data.quiz_state) setQuizState(data.quiz_state);
      if (data.quiz_state === 'question' && data.question_start_time) {
        startAdminTimer(data.question_start_time, data.time_limit ?? data.current_time_limit ?? 30);
      }
    });

    const off6 = addListener('quiz_starting', (data) => {
      setCurrentQuestionIndex(0);
      setQuizState('question');
      setAnsweredCount(0);
      if (data.question_start_time) {
        startAdminTimer(data.question_start_time, data.time_limit ?? 30);
      }
    });

    const off7 = addListener('next_question', (data) => {
      const qIdx = data.current_question ?? 0;
      setCurrentQuestionIndex(qIdx);
      setQuizState('question');
      setAnsweredCount(0);
      if (data.question_start_time) {
        startAdminTimer(data.question_start_time, data.time_limit ?? 30);
      }
    });

    const off8 = addListener('show_answer', () => {
      setQuizState('answer_reveal');
      stopTimer();
    });

    const off9 = addListener('show_leaderboard', (data) => {
      setQuizState(data.quiz_state ?? 'leaderboard');
      stopTimer();
      const questionNumber = data.question_number || ((data.current_question ?? currentQuestionIndex) + 1);
      const total = data.total_questions || totalQuestions;
      navigate(`/leaderboard/${code}?qnum=${questionNumber}&total=${total}&final=${data.is_final ? '1' : '0'}`);
    });

    const off10 = addListener('show_podium', () => {
      navigate(`/podium/${code}`);
    });

    // Quiz ended — redirect admin
    const off11 = addListener('quiz_ended', () => {
      navigate('/admin');
    });

    // Player kicked — remove from list
    const off12 = addListener('participant_kicked', (data) => {
      setParticipants(prev => prev.filter(p => p.id !== data.participantId));
      toast.success(`${data.name} was removed from the game`);
    });

    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); off8(); off9(); off10(); off11(); off12(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const handleStartQuiz = useCallback(() => {
    if (participants.length === 0) {
      toast.error('⚠️ No participants yet!');
      return;
    }
    send({ type: 'quiz_starting' });
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    navigate(`/quiz/${code}`);
  }, [participants.length, send, navigate, code]);

  const handleEndQuiz = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      await axios.patch(`${API}/admin/quiz/${code}/status?status=ended`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Quiz ended');
      navigate('/admin');
    } catch {
      toast.error('Failed to end quiz');
    }
  }, [code, navigate]);

  const handleKickPlayer = useCallback((participant) => {
    if (!socket) return;
    send({ type: 'kick_player', participantId: participant.id });
  }, [socket, send]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-20 h-20 border-8 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>

      {/* Top bar */}
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b border-purple-500/20"
        style={{ background: 'rgba(15,5,36,0.95)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full animate-pulse ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-green-400 text-sm font-semibold">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <span className="text-gray-400 text-xs">Game PIN</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white tracking-wider" style={{ fontFamily: 'Fredoka,sans-serif' }}>{code}</span>
                <button onClick={copyCode} className="text-purple-400 hover:text-purple-300">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            {quizState !== 'lobby' && totalQuestions > 0 && (
              <>
                <div className="h-6 w-px bg-white/10 hidden md:block" />
                <div className="hidden md:flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="text-white text-sm font-bold">Q{currentQuestionIndex + 1}/{totalQuestions}</span>
                  {timeLeft > 0 && (
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${timeLeft <= 5 ? 'bg-red-500 text-white' : 'bg-purple-500/30 text-purple-300'}`}>
                      {timeLeft}s
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-500/30"
              style={{ background: 'rgba(124,58,237,0.1)' }}>
              <Users className="w-4 h-4 text-purple-400" />
              <span className="text-white font-bold">{participants.length}</span>
              <span className="text-gray-400 text-sm hidden sm:inline">players</span>
            </div>
            <button onClick={handleEndQuiz}
              className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-semibold transition-all">
              <LogOut className="w-4 h-4 inline mr-1" /> End
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 px-4 md:px-8 pb-10">
        <div className="max-w-5xl mx-auto">

          {/* Quiz title */}
          <div className="text-center py-8 md:py-12">
            <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 3, repeat: Infinity }}
              className="inline-flex items-center gap-3 mb-4 px-4 py-2 rounded-full border border-purple-500/30"
              style={{ background: 'rgba(124,58,237,0.1)' }}>
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-purple-300 text-sm font-semibold">
                {quizState === 'lobby' ? 'Waiting for players' : `Question ${currentQuestionIndex + 1} of ${totalQuestions}`}
              </span>
            </motion.div>

            <h1 className="text-4xl md:text-6xl font-black text-white mb-4"
              style={{ fontFamily: 'Fredoka, sans-serif' }}>
              {quiz?.title}
            </h1>

            {/* Game PIN card */}
            <div className="max-w-lg mx-auto rounded-2xl p-6 mb-6"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(124,58,237,0.3)' }}>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="text-center">
                  <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">Game PIN</p>
                  <div className="text-4xl md:text-5xl font-black text-white tracking-wider cursor-pointer select-all"
                    onClick={copyCode} style={{ fontFamily: 'Fredoka, sans-serif' }}>
                    {code}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyJoinLink}
                    className="text-purple-400 hover:text-white hover:bg-white/10 border border-purple-500/30">
                    <Copy className="w-4 h-4 mr-1" /> Link
                  </Button>
                  <Button variant="ghost" size="sm" onClick={shareQuiz}
                    className="text-purple-400 hover:text-white hover:bg-white/10 border border-purple-500/30">
                    <Share2 className="w-4 h-4 mr-1" /> Share
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowQR(!showQR)}
                    className="text-purple-400 hover:text-white hover:bg-white/10 border border-purple-500/30">
                    <QrCode className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <AnimatePresence>
                {showQR && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="mt-4 flex justify-center overflow-hidden">
                    <div className="bg-white p-3 rounded-xl">
                      <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 rounded" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-2xl border border-purple-500/20 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="px-6 py-4 border-b border-purple-500/20 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                Players in Lobby
              </h2>
              <span className="text-sm text-purple-400">{participants.length} joined</span>
            </div>

            <div className="p-6">
              {participants.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">👾</div>
                  <p className="text-gray-400 text-lg">Waiting for players to join...</p>
                  <p className="text-gray-500 text-sm mt-1">Share the PIN: <span className="text-purple-400 font-bold">{code}</span></p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-80 overflow-y-auto">
                  <AnimatePresence>
                    {participants.map((p, i) => (
                      <motion.div key={p.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', delay: i * 0.03 }}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 transition-all group relative">
                        <div className="relative">
                          <DicebearAvatar seed={p.avatarSeed} size="md" />
                          {i === 0 && (
                            <div className="absolute -top-1 -right-1 bg-yellow-400 text-purple-900 rounded-full p-0.5">
                              <Crown className="w-2.5 h-2.5" />
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0F0524]" />
                        </div>
                        <span className="text-xs text-gray-300 truncate w-full text-center font-medium">{p.name}</span>
                        {/* Kick button - visible on hover */}
                        {quizState === 'lobby' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleKickPlayer(p); }}
                            className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                            title={`Kick ${p.name}`}
                          >
                            <UserX className="w-3 h-3" />
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Start button */}
          {quizState === 'lobby' && (
            <div className="mt-8 flex justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleStartQuiz}
                disabled={participants.length === 0}
                className="px-16 py-5 rounded-2xl text-2xl font-black text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                style={{
                  fontFamily: 'Fredoka, sans-serif',
                  background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                  boxShadow: '0 8px 32px rgba(124,58,237,0.5)',
                }}>
                <Play className="w-7 h-7 inline mr-3" /> Start Game
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminControl;