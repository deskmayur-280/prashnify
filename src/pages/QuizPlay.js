import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Check, X, BarChart3, Users, Zap, Star, Flame, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { sounds, setMuted, isMuted } from '@/utils/sounds';
import { bgMusic } from '@/utils/bgMusic';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const ANSWER_COLORS = [
  { bg: '#E53E3E', hover: '#C53030', glow: 'rgba(229,62,62,0.3)' },
  { bg: '#3182CE', hover: '#2C5282', glow: 'rgba(49,130,206,0.3)' },
  { bg: '#D69E2E', hover: '#B7791F', glow: 'rgba(214,158,46,0.3)' },
  { bg: '#38A169', hover: '#276749', glow: 'rgba(56,161,105,0.3)' },
];

const ANSWER_EMOJIS = ['🔺', '🔷', '🟢', '🟧'];

// Floating background shapes for playful feel
const FLOATING_SHAPES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  emoji: ['⭐', '✨', '💫', '🎯', '🎮', '🏆', '⚡', '🎪'][i % 8],
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 12 + Math.random() * 18,
  duration: 8 + Math.random() * 15,
  delay: Math.random() * 5,
}));

const QuizPlay = () => {
  const { code } = useParams();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const questionsRef = useRef([]);
  const [loading, setLoading] = useState(true);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [displayQuestionNumber, setDisplayQuestionNumber] = useState(1);
  const [totalQuestionsCount, setTotalQuestionsCount] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [result, setResult] = useState(null);
  const [showAnswerReveal, setShowAnswerReveal] = useState(false);
  const [currentQuestionData, setCurrentQuestionData] = useState(null);

  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(20);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);
  const questionStartTimeRef = useRef(0);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [disconnected, setDisconnected] = useState(false);
  const [answerStats, setAnswerStats] = useState({});
  const [muted, setMutedState] = useState(false);

  // Reactions
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [myReactionCooldown, setMyReactionCooldown] = useState(false);
  const pendingSubmission = useRef(null);

  // 5-second countdown before quiz start
  const [countdownValue, setCountdownValue] = useState(null);
  const [isCountingDown, setIsCountingDown] = useState(false);

  const { socket, isConnected, connect, send, addListener } = useSocket();

  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const participantId = localStorage.getItem('participantId');

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    bgMusic.setMuted(next);
  };

  // ─── Helpers ────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerActive(false);
  }, []);

  const resetQuestionState = useCallback(() => {
    stopTimer();
    setSelectedOption(null);
    setAnswered(false);
    setResult(null);
    setShowAnswerReveal(false);
    setAnsweredCount(0);
    setTimeLeft(0);
    setAnswerStats({});
    questionStartTimeRef.current = 0;
  }, [stopTimer]);

  // Read time_limit from broadcast data with 4-level fallback
  const getTimeLimit = (data) => {
    return (
      data.time_limit ||
      data.timeLimit ||
      data.question?.time_limit ||
      data.question?.timeLimit ||
      20
    );
  };

  // Timer that takes a duration in seconds (NOT question index)
  const startTimer = useCallback((duration) => {
    const validDuration = Math.max(1, Math.floor(Number(duration) || 20));
    stopTimer();
    setTotalTime(validDuration);
    setTimeLeft(validDuration);
    setTimerActive(true);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if (next <= 5 && next > 0) sounds.tick();
        if (next <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setTimerActive(false);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  // Timer starting from a remaining value (for reconnection)
  const startTimerFrom = useCallback((remaining, total) => {
    const validRemaining = Math.max(0, Math.floor(Number(remaining) || 0));
    const validTotal = Math.max(1, Math.floor(Number(total) || 20));
    stopTimer();
    setTotalTime(validTotal);
    setTimeLeft(validRemaining);
    if (validRemaining <= 0) return;
    setTimerActive(true);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // ─── Fetch questions ────────────────────────────────────────────
  useEffect(() => {
    if (!participantId && !isAdmin) {
      toast.error('Please join the quiz first');
      navigate('/join');
      return;
    }
    const pid = isAdmin ? 'admin' : participantId;
    axios.get(`${API}/quiz/${code}/questions`, { params: { participantId: pid } })
      .then(res => {
        const qs = res.data.questions || [];
        setQuestions(qs);
        questionsRef.current = qs;
        setTotalQuestionsCount(qs.length);
        setLoading(false);
      })
      .catch(() => { toast.error('Failed to load questions'); navigate('/join'); });
  }, [code, navigate, isAdmin, participantId]);

  // ─── Fetch saved score on mount (persistent star) ─────────────
  useEffect(() => {
    if (!participantId || isAdmin) return;
    axios.get(`${API}/quiz/${code}/state`, { params: { participantId } })
      .then(res => {
        if (res.data.participant_score != null) {
          setScore(res.data.participant_score);
        }
      })
      .catch(() => {});
  }, [participantId, isAdmin, code]);

  // ─── WebSocket ───────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { connect(code, participantId, isAdmin); }, [code]);

  // When QuizPlay remounts (e.g. navigating back from leaderboard) with socket
  // already connected, connect() returns early and no sync happens.
  // Explicitly request state sync so we get the correct question + timer.
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Small delay to ensure listeners are registered first
      const timer = setTimeout(() => {
        send({ type: 'request_state_sync' });
      }, 150);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // Start quiz music
  useEffect(() => {
    bgMusic.startQuiz();
    return () => bgMusic.stop();
  }, []);

  // Reaction listener — always active
  useEffect(() => {
    if (!socket) return;
    const cleanup = addListener('reaction', (data) => {
      const id = `${Date.now()}-${Math.random()}`;
      const x = 10 + Math.random() * 70;
      setFloatingReactions(prev => [...prev, { id, emoji: data.emoji, x }]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id));
      }, 3500);
    });
    return cleanup;
  }, [socket, addListener]);

  useEffect(() => {
    if (!socket) return;

    const off1 = addListener('answer_count', (d) => {
      setAnsweredCount(d.answeredCount ?? 0);
      setTotalParticipants(d.totalParticipants ?? 0);
    });

    const off2 = addListener('sync_state', (d) => {
      const qIdx = d.current_question ?? 0;
      setCurrentQuestionIndex(qIdx);
      questionsRef.current._currentIndex = qIdx;
      setDisplayQuestionNumber(d.question_number || qIdx + 1);
      setTotalQuestionsCount(d.total_questions || questionsRef.current.length);
      setShowAnswerReveal(d.show_answers ?? false);

      // Apply server-sent question data (field may be 'question' or 'current_question_data')
      const qData = d.question || d.current_question_data;
      if (qData) {
        setCurrentQuestionData(qData);
      } else if (questionsRef.current[qIdx]) {
        // Fallback: use local questions array when server doesn't include question data
        // This fixes the last question not rendering after navigating from Leaderboard
        setCurrentQuestionData(questionsRef.current[qIdx]);
      }

      // Countdown state
      if (d.quiz_state === 'countdown') {
        setIsCountingDown(true);
        setCountdownValue(d.countdown || 1);
        return;
      }

      // If server says redirect to leaderboard (NOT answer_reveal — that shows in-place)
      if (d.redirect_leaderboard || d.redirect_to === 'leaderboard' ||
          d.quiz_state === 'leaderboard' || d.quiz_state === 'final_leaderboard') {
        stopTimer();
        const qNum = d.question_number || (qIdx + 1);
        const total = d.total_questions || questionsRef.current.length;
        const isFinal = d.is_final || d.quiz_state === 'final_leaderboard';
        navigate(`/leaderboard/${code}?qnum=${qNum}&total=${total}&final=${isFinal ? '1' : '0'}`);
        return;
      }

      // If server says redirect to podium
      if (d.redirect_podium || d.quiz_state === 'podium') {
        stopTimer();
        navigate(`/podium/${code}`);
        return;
      }

      if (d.quiz_state === 'question') {
        setIsCountingDown(false);
        setCountdownValue(null);
        // Reset interaction state individually (don't call resetQuestionState
        // which would clear currentQuestionData we just set above)
        setSelectedOption(null);
        setAnswered(false);
        setResult(null);
        setAnsweredCount(0);
        setAnswerStats({});
        // Set question start time for accurate answer timing
        if (d.question_start_time) {
          questionStartTimeRef.current = d.question_start_time;
        } else {
          questionStartTimeRef.current = Date.now();
        }
        const timeLimit = getTimeLimit(d);
        if (!d.show_answers) {
          if (d.time_remaining != null && d.time_remaining > 0) {
            startTimerFrom(d.time_remaining, timeLimit);
          } else if (d.time_remaining === 0) {
            // Timer already expired — just show 0
            setTimeLeft(0);
            setTotalTime(timeLimit);
          } else {
            startTimer(timeLimit);
          }
        } else {
          stopTimer();
          setShowAnswerReveal(true);
        }
      }
    });

    const off3 = addListener('quiz_starting', (d) => {
      setIsCountingDown(false);
      setCountdownValue(null);
      const qIdx = d.current_question ?? 0;
      setCurrentQuestionIndex(qIdx);
      questionsRef.current._currentIndex = qIdx;
      setDisplayQuestionNumber(d.question_number || 1);
      setTotalQuestionsCount(d.total_questions || questionsRef.current.length);
      if (d.question) setCurrentQuestionData(d.question);
      resetQuestionState();
      setStreak(0);
      setScore(0);
      // Set question start time for accurate answer timing
      questionStartTimeRef.current = d.question_start_time || Date.now();
      sounds.quizStart();
      const timeLimit = getTimeLimit(d);
      requestAnimationFrame(() => startTimer(timeLimit));
    });

    const off3b = addListener('countdown_start', (d) => {
      setIsCountingDown(true);
      setCountdownValue(d.countdown || 5);
      if (d.total_questions) setTotalQuestionsCount(d.total_questions);
    });

    const off3c = addListener('countdown_tick', (d) => {
      setCountdownValue(d.countdown);
      if (d.countdown <= 3) sounds.tick();
    });

    const off4 = addListener('next_question', (d) => {
      stopTimer();
      const qIdx = d.current_question ?? 0;
      const qNum = d.question_number || (qIdx + 1);
      const total = d.total_questions || questionsRef.current.length;
      const timeLimit = getTimeLimit(d);

      setCurrentQuestionIndex(qIdx);
      questionsRef.current._currentIndex = qIdx;
      setDisplayQuestionNumber(qNum);
      setTotalQuestionsCount(total);
      if (d.question) setCurrentQuestionData(d.question);
      setSelectedOption(null);
      setAnswered(false);
      setShowAnswerReveal(false);
      setResult(null);
      setAnswerStats({});
      setAnsweredCount(0);
      // Set question start time for accurate answer timing
      questionStartTimeRef.current = d.question_start_time || Date.now();

      requestAnimationFrame(() => startTimer(timeLimit));
    });

    const off5 = addListener('show_answer', async () => {
      setShowAnswerReveal(true);
      stopTimer();
      try {
        // Use the ref-tracked index to avoid stale closure
        const ci = questionsRef.current._currentIndex ?? 0;
        const res = await axios.get(`${API}/quiz/${code}/question/${ci}/stats`);
        setAnswerStats(res.data.stats || {});
      } catch { /* ignore */ }
    });

    const off6 = addListener('show_leaderboard', (d) => {
      stopTimer();
      const questionNumber = d.question_number || (d.current_question + 1) || 1;
      const total = d.total_questions || questionsRef.current.length;
      navigate(`/leaderboard/${code}?qnum=${questionNumber}&total=${total}&final=${d.is_final ? '1' : '0'}`);
    });

    const off7 = addListener('show_podium', () => { stopTimer(); navigate(`/podium/${code}`); });

    const off8 = addListener('connection_status', (d) => {
      if (d.connected) {
        setDisconnected(false);
        if (pendingSubmission.current) {
          const p = pendingSubmission.current;
          pendingSubmission.current = null;
          axios.post(`${API}/submit-answer`, {
            participantId, quizCode: code,
            questionIndex: p.questionIndex,
            selectedOption: p.selectedOption,
            timeTaken: p.timeTaken
          }).then(res => {
            setResult(res.data);
            if (res.data.correct) setScore(s => s + (res.data.points || 0));
            toast.success('✅ Queued answer submitted!');
          }).catch(() => {});
        }
      } else {
        setDisconnected(true);
      }
    });

    const off9 = addListener('answer_stats', (d) => {
      const ci = questionsRef.current._currentIndex ?? 0;
      if (d.questionIndex === ci) setAnswerStats(d.stats || {});
    });

    // Quiz ended by admin — redirect everyone
    const off10 = addListener('quiz_ended', () => {
      stopTimer();
      toast.info('📢 Quiz has been ended by the host');
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    });

    // Player was kicked by admin
    const off11 = addListener('participant_kicked', (d) => {
      if (!isAdmin && d.participantId === participantId) {
        stopTimer();
        localStorage.removeItem('participantId');
        localStorage.removeItem('participantName');
        toast.error('You have been removed from this quiz by the host');
        navigate('/');
      }
    });

    return () => { off1(); off2(); off3(); off3b(); off3c(); off4(); off5(); off6(); off7(); off8(); off9(); off10(); off11(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ─── Auto-submit on timeout ──────────────────────────────────────
  useEffect(() => {
    if (timeLeft === 0 && timerActive && !answered && !isAdmin && participantId) {
      setAnswered(true);
      setTimerActive(false);
      stopTimer();
      toast.error("⏰ Time's up!");
      send({ type: 'auto_submit', participantId, questionIndex: currentQuestionIndex });
      axios.post(`${API}/submit-answer`, {
        participantId, quizCode: code,
        questionIndex: currentQuestionIndex,
        selectedOption: -1,
        timeTaken: (questionsRef.current[currentQuestionIndex]?.timeLimit || 20)
      }).catch(() => {});
    }
  }, [timeLeft, timerActive, answered, isAdmin, participantId, currentQuestionIndex, stopTimer, send, code]);

  // ─── Submit answer ───────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedOption === null || answered || isAdmin) return;

    const now = Date.now();
    const startTime = questionStartTimeRef.current;
    const timeTaken = startTime > 0 ? Math.max(0.1, (now - startTime) / 1000) : 5;
    const question = questionsRef.current[currentQuestionIndex];
    const timeLimit = question?.timeLimit || 20;

    setAnswered(true);
    stopTimer();

    try {
      const response = await axios.post(`${API}/submit-answer`, {
        participantId, quizCode: code,
        questionIndex: currentQuestionIndex,
        selectedOption, timeTaken
      });

      setResult(response.data);

      if (response.data.correct) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        setScore(prev => prev + (response.data.points || 0));
        sounds.correct();
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });

        const timeUsedPct = timeTaken / timeLimit;
        let speedMsg = '';
        if (timeUsedPct < 0.25) speedMsg = '⚡ Blazing fast!';
        else if (timeUsedPct < 0.5) speedMsg = '🏃 Fast!';
        else if (timeUsedPct < 0.75) speedMsg = '👍 Good!';
        else speedMsg = '😅 Just in time!';

        const parts = [`+${response.data.points} pts`];
        if (response.data.streakBonus > 0) parts.push(`🔥 streak`);
        toast.success(`${speedMsg} ${parts.join(' • ')}`);
      } else {
        setStreak(0);
        sounds.wrong();
        toast.error('❌ Wrong answer!');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to submit';
      if (msg.includes('already answered')) return;

      if (!navigator.onLine || err.code === 'ERR_NETWORK') {
        pendingSubmission.current = { selectedOption, timeTaken, questionIndex: currentQuestionIndex };
        toast.warning('📡 Answer saved — will submit when reconnected');
        return;
      }
      setAnswered(false);
      startTimer(currentQuestionIndex, questionStartTimeRef.current);
      toast.error(msg);
    }
  };

  const handleShowAnswer = () => send({ type: 'show_answer' });
  const handleShowLeaderboard = () => send({ type: 'show_leaderboard' });

  const sendReaction = useCallback((emoji) => {
    if (myReactionCooldown || isAdmin) return;
    send({ type: 'reaction', emoji });
    setMyReactionCooldown(true);
    setTimeout(() => setMyReactionCooldown(false), 2000);
  }, [myReactionCooldown, isAdmin, send]);

  // ─── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-[6px] border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Resolve current question: prefer server-sent data, fallback to local array
  const currentQuestion = currentQuestionData || questions[currentQuestionIndex];
  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="rounded-2xl p-8 text-center max-w-md" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(124,58,237,0.3)' }}>
          <div className="text-5xl mb-4">⏳</div>
          <p className="text-xl font-bold text-white" style={{ fontFamily: 'Fredoka,sans-serif' }}>Waiting for quiz to start...</p>
          <p className="text-gray-400 mt-2 text-sm">Stay on this page</p>
        </motion.div>
      </div>
    );
  }

  const isTrueFalse = currentQuestion.type === 'trueFalse' || currentQuestion.options?.length === 2;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>

      {/* FLOATING PLAYFUL SHAPES — background decoration */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {FLOATING_SHAPES.map(shape => (
          <motion.div
            key={shape.id}
            className="absolute select-none"
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, fontSize: shape.size, opacity: 0.12 }}
            animate={{
              y: [0, -30, 0, 30, 0],
              x: [0, 15, -15, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: shape.duration,
              repeat: Infinity,
              delay: shape.delay,
              ease: 'easeInOut',
            }}
          >
            {shape.emoji}
          </motion.div>
        ))}
      </div>

      {/* FLOATING REACTIONS — z-[100] */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        <AnimatePresence>
          {floatingReactions.map(r => (
            <motion.div
              key={r.id}
              className="absolute text-5xl select-none"
              style={{ left: `${r.x}%`, bottom: 0 }}
              initial={{ y: 0, opacity: 1, scale: 0.5 }}
              animate={{ y: -window.innerHeight * 0.9, opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: "easeOut" }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* RECONNECTION OVERLAY */}
      <AnimatePresence>
        {disconnected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
            style={{ background: 'rgba(15,5,36,0.95)', backdropFilter: 'blur(12px)' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 rounded-full border-4 border-purple-500/30 border-t-purple-500 mb-4" />
            <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Fredoka,sans-serif' }}>Reconnecting...</h3>
            <p className="text-gray-400 text-sm">Hang tight, getting you back in the game</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5-SECOND COUNTDOWN OVERLAY */}
      <AnimatePresence>
        {isCountingDown && countdownValue !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[500] flex flex-col items-center justify-center"
            style={{ background: 'rgba(124, 77, 255, 0.92)', backdropFilter: 'blur(8px)' }}>
            <motion.div
              key={countdownValue}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}>
              <span style={{
                fontFamily: 'Fredoka One, Fredoka, sans-serif',
                fontSize: 'clamp(5rem, 25vw, 10rem)',
                color: '#FFFFFF',
                display: 'block',
                textAlign: 'center',
                lineHeight: 1,
                textShadow: '0 4px 30px rgba(0,0,0,0.3)',
              }}>
                {countdownValue}
              </span>
            </motion.div>
            <motion.p
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 800,
                fontSize: 'clamp(1rem, 4vw, 1.5rem)',
                color: 'rgba(255,255,255,0.9)',
                marginTop: '24px',
              }}>
              Get Ready! 🚀
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen score screen */}
      <AnimatePresence>
        {!isAdmin && answered && !showAnswerReveal && result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex flex-col items-center justify-center p-6"
            style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>
            {result.correct ? (
              <>
                <motion.div animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }} transition={{ duration: 0.6 }}
                  className="text-8xl mb-6">✅</motion.div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-2" style={{ fontFamily: 'Fredoka,sans-serif' }}>Correct!</h2>
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="text-center">
                  <div className="text-6xl md:text-7xl font-black text-yellow-300 mb-2">+{result.points}</div>
                  <div className="text-white/80 text-lg">
                    {result.basePoints} base + {result.timeBonus} speed
                    {result.streakBonus > 0 && ` + ${result.streakBonus} 🔥 streak`}
                  </div>
                </motion.div>
                <div className="mt-8 rounded-2xl px-8 py-4 text-center" style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <div className="text-gray-400 text-sm">Total Score</div>
                  <div className="text-4xl font-black text-white">{score}</div>
                </div>
                {streak >= 3 && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-4 flex items-center gap-2 bg-orange-500/80 rounded-full px-5 py-2">
                    <Flame className="w-5 h-5 text-yellow-200" />
                    <span className="text-white font-bold">{streak} streak!</span>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <motion.div animate={{ x: [-10, 10, -10, 0] }} transition={{ duration: 0.4 }} className="text-8xl mb-6">❌</motion.div>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4" style={{ fontFamily: 'Fredoka,sans-serif' }}>
                  {selectedOption === null || selectedOption === -1 ? "Time's up!" : 'Wrong!'}
                </h2>
                <div className="text-gray-400 text-xl">Better luck next question!</div>
              </>
            )}
            <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute bottom-8 text-gray-500 text-sm">Waiting for others...</motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP HUD */}
      <div className="fixed top-0 left-0 right-0 z-30 px-4 py-3"
        style={{ background: 'rgba(15,5,36,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(124,58,237,0.2)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Question progress */}
          <div className="flex items-center gap-3">
            <div className="text-white font-bold text-sm">
              <span className="text-purple-400">Q</span>
              <span className="text-2xl font-black" style={{ fontFamily: 'Fredoka,sans-serif' }}>{displayQuestionNumber}</span>
              <span className="text-gray-400 text-sm">/{totalQuestionsCount}</span>
            </div>
            {/* Progress dots */}
            <div className="hidden sm:flex gap-1">
              {Array.from({ length: totalQuestionsCount }).map((_, i) => (
                <div key={i} className={`rounded-full transition-all ${
                  i < displayQuestionNumber - 1 ? 'w-2 h-2 bg-green-400' :
                  i === displayQuestionNumber - 1 ? 'w-4 h-2 bg-purple-400' :
                  'w-2 h-2 bg-white/20'
                }`} />
              ))}
            </div>
          </div>

          {/* Timer — visible for BOTH admin and player */}
          {(() => {
            const timerProgress = totalTime > 0 ? timeLeft / totalTime : 0;
            const circumference = 2 * Math.PI * 24;
            return (
              <motion.div
                animate={timeLeft <= 5 && timeLeft > 0 ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center flex-shrink-0"
              >
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle cx="28" cy="28" r="24" fill="none"
                    stroke={timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#7C3AED'}
                    strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - timerProgress)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                  />
                </svg>
                <span className={`text-xl font-black z-10 ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}
                  style={{ fontFamily: 'Fredoka,sans-serif' }}>{timeLeft}</span>
              </motion.div>
            );
          })()}

          <div className="flex items-center gap-2">
            {/* Score */}
            {!isAdmin && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-yellow-500/30"
                style={{ background: 'rgba(245,158,11,0.1)' }}>
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-white font-black text-sm" style={{ fontFamily: 'Fredoka,sans-serif' }}>{score.toLocaleString()}</span>
              </div>
            )}

            {/* Admin answered count */}
            {isAdmin && (
              <div className="text-white text-sm">
                <span className="text-green-400 font-bold text-lg">{answeredCount}</span>
                <span className="text-gray-400"> / {totalParticipants}</span>
              </div>
            )}

            {/* Streak */}
            {!isAdmin && streak >= 3 && (
              <motion.div
                animate={{ scale: [1, 1.1, 1], boxShadow: ['0 0 0 rgba(249,115,22,0)', '0 0 12px rgba(249,115,22,0.6)', '0 0 0 rgba(249,115,22,0)'] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1 bg-orange-500/80 rounded-full px-2 py-1">
                <Flame className="w-3 h-3 text-yellow-200" />
                <span className="text-white text-xs font-bold">{streak}🔥</span>
              </motion.div>
            )}

            {/* Mute */}
            <button onClick={toggleMute}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Answer progress bar */}
        {!showAnswerReveal && totalParticipants > 0 && (
          <div className="h-0.5 bg-white/10 mt-2">
            <motion.div className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full"
              animate={{ width: `${(answeredCount / totalParticipants) * 100}%` }}
              transition={{ duration: 0.4 }} />
          </div>
        )}
      </div>

      {/* QUESTION + ANSWERS */}
      <div className="pt-24 pb-24 px-4">
        <div className="max-w-4xl mx-auto">

          {/* Question card */}
          <motion.div
            key={`q-${currentQuestionIndex}`}
            initial={{ y: -30, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="rounded-2xl p-4 sm:p-6 md:p-10 text-center mb-4 relative overflow-hidden min-h-[100px] flex flex-col items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 0 40px rgba(124,58,237,0.1)' }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-purple-500/40 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-purple-500/40 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-purple-500/40 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-500/40 rounded-br-2xl" />

            {/* Sparkle accent */}
            <motion.div className="absolute top-3 right-3 text-purple-400/30"
              animate={{ rotate: [0, 180, 360], scale: [1, 1.2, 1] }}
              transition={{ duration: 4, repeat: Infinity }}>
              <Sparkles className="w-5 h-5" />
            </motion.div>

            {currentQuestion.media && (
              <img src={currentQuestion.media} alt="Question" className="w-full max-h-48 object-contain rounded-xl mb-4" />
            )}
            <h2 className="text-white font-bold leading-snug break-words w-full"
              style={{ fontFamily: 'Fredoka, sans-serif', fontSize: 'clamp(1rem, 3.5vw, 2rem)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {currentQuestion.question}
            </h2>
          </motion.div>

          {/* Answer grid — responsive: single column on mobile, 2 cols on larger screens */}
          <div className={`grid gap-3 ${isTrueFalse ? 'grid-cols-1 max-w-xl mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {currentQuestion.options?.map((option, idx) => {
              const color = ANSWER_COLORS[idx] || ANSWER_COLORS[0];
              const isSelected = selectedOption === idx;
              const correctAnswer = result?.correctAnswer;
              const isCorrect = showAnswerReveal && (Array.isArray(correctAnswer) ? correctAnswer.includes(idx) : correctAnswer === idx);
              const isWrong = showAnswerReveal && isSelected && !isCorrect;

              return (
                <motion.button key={idx}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: showAnswerReveal && !isCorrect && !isSelected ? 0.5 : 1 }}
                  transition={{ delay: 0.1 + idx * 0.07, type: 'spring', stiffness: 300, damping: 20 }}
                  whileHover={!answered && !isAdmin ? { scale: 1.03, y: -2 } : {}}
                  whileTap={!answered && !isAdmin ? { scale: 0.95 } : {}}
                  onClick={() => !answered && !isAdmin && setSelectedOption(idx)}
                  disabled={answered || isAdmin}
                  className="relative rounded-2xl overflow-hidden text-left transition-all"
                  style={{
                    minHeight: '60px',
                    background: isCorrect ? '#10B981' : isWrong ? '#EF4444' : showAnswerReveal ? `${color.bg}60` : color.bg,
                    border: isSelected && !showAnswerReveal ? '3px solid white'
                      : isCorrect ? '3px solid #6EE7B7' : isWrong ? '3px solid #FCA5A5' : '3px solid transparent',
                    boxShadow: isSelected && !showAnswerReveal
                      ? `0 8px 25px ${color.glow || color.bg + '60'}, 0 0 0 1px rgba(255,255,255,0.2)`
                      : isCorrect ? '0 4px 20px rgba(16,185,129,0.4)'
                      : 'none',
                  }}>
                  <div className="flex items-center gap-3 p-3 sm:p-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0 text-lg">
                      {ANSWER_EMOJIS[idx] || '🔵'}
                    </div>
                    <span className="text-white font-bold leading-tight break-words"
                      style={{ fontSize: 'clamp(0.85rem, 2.2vw, 1.15rem)', overflowWrap: 'anywhere', wordBreak: 'break-word', flex: 1 }}>
                      {isTrueFalse ? (idx === 0 ? 'True' : 'False') : option}
                    </span>
                    {showAnswerReveal && (isCorrect || isWrong) && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="ml-auto flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        {isCorrect ? <Check className="w-5 h-5 text-white" strokeWidth={3} />
                          : <X className="w-5 h-5 text-white" strokeWidth={3} />}
                      </motion.div>
                    )}
                  </div>
                  {isSelected && !showAnswerReveal && (
                    <motion.div className="absolute inset-0 bg-white/10"
                      animate={{ opacity: [0.05, 0.2, 0.05] }}
                      transition={{ duration: 1.2, repeat: Infinity }} />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Answer distribution */}
          {showAnswerReveal && Object.keys(answerStats).length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="mt-4 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-gray-400 text-xs font-semibold mb-3 uppercase tracking-wider">How everyone voted</p>
              <div className="space-y-2">
                {currentQuestion.options?.map((opt, idx) => {
                  const count = answerStats[String(idx)] || 0;
                  const total = Object.values(answerStats).reduce((a, b) => Number(a) + Number(b), 0) || 1;
                  const pct = Math.round((count / total) * 100);
                  const correctAnswer = result?.correctAnswer;
                  const isC = Array.isArray(correctAnswer) ? correctAnswer.includes(idx) : correctAnswer === idx;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex-shrink-0 text-xs flex items-center justify-center text-white font-bold"
                        style={{ background: ANSWER_COLORS[idx]?.bg || '#888' }}>
                        {['△', '◆', '●', '■'][idx]}
                      </div>
                      <div className="flex-1 h-6 rounded-full overflow-hidden bg-white/10">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.2 + idx * 0.1 }}
                          className="h-full rounded-full flex items-center justify-end pr-2"
                          style={{ background: isC ? '#10B981' : (ANSWER_COLORS[idx]?.bg || '#888') + '90' }}>
                          {pct > 15 && <span className="text-white text-xs font-bold">{pct}%</span>}
                        </motion.div>
                      </div>
                      <span className="text-gray-400 text-xs w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Submit button */}
          <AnimatePresence>
            {!isAdmin && !answered && selectedOption !== null && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
                className="mt-4 flex justify-center">
                <button onClick={handleSubmit}
                  className="px-10 py-4 rounded-2xl text-xl font-black text-white transition-all"
                  style={{ fontFamily: 'Fredoka,sans-serif', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 8px 24px rgba(124,58,237,0.5)' }}>
                  <Zap className="w-5 h-5 inline mr-2" /> Submit Answer
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Admin controls */}
          {isAdmin && !showAnswerReveal && (
            <div className="mt-6 flex justify-center">
              <button onClick={handleShowAnswer}
                className="px-10 py-4 rounded-2xl text-xl font-black text-white"
                style={{ fontFamily: 'Fredoka,sans-serif', background: 'linear-gradient(135deg, #F59E0B, #D97706)', boxShadow: '0 8px 24px rgba(245,158,11,0.4)' }}>
                Reveal Answers
              </button>
            </div>
          )}
          {isAdmin && showAnswerReveal && (
            <div className="mt-6 flex justify-center">
              <button onClick={handleShowLeaderboard}
                className="px-10 py-4 rounded-2xl text-xl font-black text-white"
                style={{ fontFamily: 'Fredoka,sans-serif', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', boxShadow: '0 8px 24px rgba(59,130,246,0.4)' }}>
                <BarChart3 className="w-5 h-5 inline mr-2" /> Show Leaderboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* REACTION BUTTONS — Always visible for participants */}
      {!isAdmin && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
          {['🔥', '😱', '👏', '💪', '🤔', '😂'].map(emoji => (
            <motion.button key={emoji}
              whileTap={{ scale: 0.8 }}
              onClick={() => sendReaction(emoji)}
              disabled={myReactionCooldown}
              className="w-11 h-11 text-2xl bg-white/20 backdrop-blur-sm rounded-full border border-white/30 hover:bg-white/30 active:scale-90 transition-all disabled:opacity-40">
              {emoji}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizPlay;