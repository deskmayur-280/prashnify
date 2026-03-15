import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Check, X, BarChart3, Users, Zap, Star, Flame, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { sounds, setMuted, isMuted } from '@/utils/sounds';
import { bgMusic } from '@/utils/bgMusic';
import { API_BASE_URL } from '../config';

const API = `${API_BASE_URL}/api`;

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
  x: (i * 37 + 11) % 97,
  y: (i * 53 + 7) % 93,
  size: 12 + ((i * 17) % 18),
  duration: 8 + ((i * 7) % 15),
  delay: (i * 13) % 5,
}));

// ─── CSS Keyframes ───────────────────────────────────────────────
const STYLES = `
@keyframes qp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes qp-float {
  0%   { transform: translate(0px, 0px) rotate(0deg); }
  25%  { transform: translate(15px, -30px) rotate(90deg); }
  50%  { transform: translate(-15px, 0px) rotate(180deg); }
  75%  { transform: translate(0px, 30px) rotate(270deg); }
  100% { transform: translate(0px, 0px) rotate(360deg); }
}
@keyframes qp-reaction-float {
  0%   { transform: translateY(0) scale(0.5); opacity: 1; }
  100% { transform: translateY(-90vh) scale(1.5); opacity: 0; }
}
@keyframes qp-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes qp-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes qp-scale-spring {
  0%   { transform: scale(0.3); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  80%  { transform: scale(0.97); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes qp-scale-out {
  from { transform: scale(1); opacity: 1; }
  to   { transform: scale(1.5); opacity: 0; }
}
@keyframes qp-pulse-opacity {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}
@keyframes qp-score-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes qp-correct-bounce {
  0%   { transform: scale(1) rotate(0deg); }
  30%  { transform: scale(1.3) rotate(10deg); }
  60%  { transform: scale(1.3) rotate(-10deg); }
  100% { transform: scale(1) rotate(0deg); }
}
@keyframes qp-wrong-shake {
  0%, 100% { transform: translateX(0); }
  20%  { transform: translateX(-10px); }
  40%  { transform: translateX(10px); }
  60%  { transform: translateX(-10px); }
  80%  { transform: translateX(5px); }
}
@keyframes qp-points-up {
  0%   { transform: translateX(-50%) translateY(0); opacity: 1; }
  100% { transform: translateX(-50%) translateY(-40px); opacity: 0; }
}
@keyframes qp-streak-pop {
  0%   { transform: scale(0); }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}
@keyframes qp-question-enter {
  0%   { transform: translateY(-30px) scale(0.95); opacity: 0; }
  60%  { transform: translateY(4px) scale(1.01); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes qp-option-enter {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.04); opacity: 1; }
  80%  { transform: scale(0.98); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes qp-option-hover-lift {
  from { transform: scale(1) translateY(0); }
  to   { transform: scale(1.03) translateY(-2px); }
}
@keyframes qp-shimmer-pulse {
  0%, 100% { opacity: 0.05; }
  50%       { opacity: 0.2; }
}
@keyframes qp-bar-grow {
  from { width: 0; }
}
@keyframes qp-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
@keyframes qp-slide-down-fade {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes qp-timer-pulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.1); }
}
@keyframes qp-streak-hud-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(249,115,22,0); }
  50%       { transform: scale(1.1); box-shadow: 0 0 12px rgba(249,115,22,0.6); }
}
@keyframes qp-sparkle-spin {
  0%   { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(180deg) scale(1.2); }
  100% { transform: rotate(360deg) scale(1); }
}
@keyframes qp-check-pop {
  0%   { transform: scale(0); }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}
@keyframes qp-dist-enter {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes qp-countdown-number {
  0%   { transform: scale(0.35) translateY(-50px); opacity: 0; }
  55%  { transform: scale(1.12) translateY(0); opacity: 1; }
  80%  { transform: scale(0.97) translateY(0); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
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
  const [answerPercentage, setAnswerPercentage] = useState(0);
  const [allAnsweredFlash, setAllAnsweredFlash] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [answerStats, setAnswerStats] = useState({});
  const [muted, setMutedState] = useState(false);

  // T1-A: answer_confirmed
  const [answerConfirmed, setAnswerConfirmed] = useState(null);

  // T1-C: kick overlay
  const [kickedOverlay, setKickedOverlay] = useState(null);

  // T2-A: time_warning
  const [timeWarningActive, setTimeWarningActive] = useState(false);

  // T2-B: first_correct banner
  const [firstCorrectBanner, setFirstCorrectBanner] = useState(null);

  // T2-C: streak_milestone banner
  const [streakBanner, setStreakBanner] = useState(null);

  // Reactions
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [myReactionCooldown, setMyReactionCooldown] = useState(false);
  const pendingSubmission = useRef(null);

  // 5-second countdown before quiz start
  const [countdownValue, setCountdownValue] = useState(null);
  const [isCountingDown, setIsCountingDown] = useState(false);

  // Tracks current question key for CSS re-trigger
  const [questionKey, setQuestionKey] = useState(0);

  // confetti guard ref
  const confettiFiredRef = useRef(false);

  const { socket, isConnected, connect, send, addListener } = useSocket();

  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const participantId = localStorage.getItem('participantId');

  // Inject CSS once
  useEffect(() => { injectStyles(); }, []);

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
    if (!isConnected) return;
    const cleanup = addListener('reaction', (data) => {
      const id = `${Date.now()}-${Math.random()}`;
      const x = 10 + Math.random() * 70;
      setFloatingReactions(prev => [...prev, { id, emoji: data.emoji, x }]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id));
      }, 3500);
    });
    return cleanup;
  }, [isConnected, addListener]);

  useEffect(() => {
    if (!isConnected) return;

    const off1 = addListener('answer_count', (d) => {
      setAnsweredCount(d.answeredCount ?? 0);
      setTotalParticipants(d.totalParticipants ?? 0);
      setAnswerPercentage(d.percentage ?? 0);
      // T1-B: allAnswered flash
      if (d.allAnswered) {
        setAllAnsweredFlash(true);
        setTimeout(() => setAllAnsweredFlash(false), 1200);
      }
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

      // Countdown state — if we reconnect mid-countdown show overlay
      if (d.quiz_state === 'countdown' || d.quiz_state === 'starting') {
        setIsCountingDown(true);
        setCountdownValue(d.countdown || 5);
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

    // ── FIX: countdown_start ──────────────────────────────────────────────────
    // Fires the moment the admin clicks Start (~50ms WS round-trip).
    // Both admin and players navigate here from QuizLobby on this event.
    // Show the full-screen countdown overlay and pre-clear stale question state.
    const off3b = addListener('countdown_start', (d) => {
      setIsCountingDown(true);
      setCountdownValue(d.countdown ?? 5);
      if (d.total_questions) setTotalQuestionsCount(d.total_questions);
      // Pre-clear so nothing stale shows behind the overlay
      setSelectedOption(null);
      setAnswered(false);
      setResult(null);
      setShowAnswerReveal(false);
      setAnswerStats({});
    });

    // ── FIX: countdown_tick ───────────────────────────────────────────────────
    // Fires once per second: 4 → 3 → 2 → 1. Update the number in the overlay.
    const off3c = addListener('countdown_tick', (d) => {
      setCountdownValue(d.countdown);
      if (d.countdown <= 3) sounds.tick();
    });

    // ── FIX: quiz_starting ────────────────────────────────────────────────────
    // Fires AFTER the 5-second countdown completes — the quiz is actually starting.
    // Dismiss the countdown overlay and start the first question timer.
    const off3 = addListener('quiz_starting', (d) => {
      // Dismiss the countdown overlay
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
      setTimeWarningActive(false);
      setAnswerConfirmed(null);
      // Set question start time for accurate answer timing
      questionStartTimeRef.current = d.question_start_time || Date.now();
      sounds.quizStart();
      const timeLimit = getTimeLimit(d);
      setQuestionKey(k => k + 1);
      requestAnimationFrame(() => startTimer(timeLimit));
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
      setTimeWarningActive(false);
      setAnswerConfirmed(null);
      setAnswerPercentage(0);
      setAllAnsweredFlash(false);
      // Set question start time for accurate answer timing
      questionStartTimeRef.current = d.question_start_time || Date.now();
      setQuestionKey(k => k + 1);

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

    // Player was kicked by admin — toast for others
    const off11 = addListener('participant_kicked', (d) => {
      // For other players: show toast
      if (d.participantId !== participantId) {
        const el = document.createElement('div');
        el.className = 'kicked-toast';
        el.style.cssText = 'background:rgba(15,5,36,0.95);color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;font-size:0.9rem;border:1px solid rgba(124,58,237,0.3);backdrop-filter:blur(8px);cursor:pointer;font-family:Fredoka,sans-serif;';
        el.textContent = `⚡ ${d.name || d.playerName || 'Player'} was removed`;
        el.onclick = () => el.remove();
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
      }
    });

    // T1-C: you_were_kicked — full-screen overlay
    const off12 = addListener('you_were_kicked', (d) => {
      stopTimer();
      setKickedOverlay({ reason: d.reason || 'Removed by host' });
    });

    // T1-A: answer_confirmed — lock button + float points
    const off13 = addListener('answer_confirmed', (d) => {
      setAnswerConfirmed(d);
      // Auto-clear after animation completes
      setTimeout(() => setAnswerConfirmed(null), 1500);
    });

    // T2-A: time_warning — CSS pulse + Web Audio ticks
    const off14 = addListener('time_warning', () => {
      setTimeWarningActive(true);
      // Web Audio API: 5 ticks, one per second
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 5; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = i < 4 ? 880 : 1200;
          gain.gain.value = 0.15;
          osc.start(ctx.currentTime + i);
          osc.stop(ctx.currentTime + i + 0.12);
        }
      } catch (_) { /* Web Audio not available */ }
    });

    // T2-B: first_correct — slide banner from top
    const off15 = addListener('first_correct', (d) => {
      setFirstCorrectBanner(d.playerName || d.name || 'Someone');
      setTimeout(() => setFirstCorrectBanner(null), 2500);
    });

    // T2-C: streak_milestone — cinematic banner
    const off16 = addListener('streak_milestone', (d) => {
      setStreakBanner({ playerName: d.playerName || d.name, streak: d.streak, badge: d.badge });
      setTimeout(() => setStreakBanner(null), 3000);
    });

    // T3-A: participant_reconnected — toast
    const off17 = addListener('participant_reconnected', (d) => {
      toast.success(`${d.name || 'Player'} reconnected 👋`);
    });

    return () => { off1(); off2(); off3(); off3b(); off3c(); off4(); off5(); off6(); off7(); off8(); off9(); off10(); off11(); off12(); off13(); off14(); off15(); off16(); off17(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, addListener, code, navigate, isAdmin, participantId, startTimer, startTimerFrom, stopTimer, resetQuestionState]);

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
  // FIX-F2: Answer submission with retry for network/5xx errors
  const submitWithRetry = async (payload, maxRetries = 2) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await axios.post(`${API}/submit-answer`, payload);
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.detail || '';
        // Don't retry 400s (already answered, bad request)
        if (status && status < 500) throw err;
        // Don't retry if already answered
        if (msg.includes('already answered')) throw err;
        // Retry on 5xx or network error
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  };

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
      const response = await submitWithRetry({
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
        // confetti with requestIdleCallback + Safari fallback + guard
        confettiFiredRef.current = false;
        const fireConfetti = () => {
          if (confettiFiredRef.current) return;
          confettiFiredRef.current = true;
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(fireConfetti, { timeout: 1000 });
        } else {
          setTimeout(fireConfetti, 0);
        }

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
        <div
          className="w-16 h-16 border-[6px] border-purple-500 border-t-transparent rounded-full"
          style={{ animation: 'qp-spin 1s linear infinite', willChange: 'transform' }}
        />
      </div>
    );
  }

  // Resolve current question: prefer server-sent data, fallback to local array
  const currentQuestion = currentQuestionData || questions[currentQuestionIndex];

  // While counting down we don't need a currentQuestion yet — show overlay
  if (!currentQuestion && !isCountingDown) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>
        <div
          className="rounded-2xl p-8 text-center max-w-md"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(124,58,237,0.3)', animation: 'qp-scale-spring 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <div className="text-5xl mb-4">⏳</div>
          <p className="text-xl font-bold text-white" style={{ fontFamily: 'Fredoka,sans-serif' }}>Waiting for quiz to start...</p>
          <p className="text-gray-400 mt-2 text-sm">Stay on this page</p>
        </div>
      </div>
    );
  }

  const isTrueFalse = currentQuestion && (currentQuestion.type === 'trueFalse' || currentQuestion.options?.length === 2);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>

      {/* FLOATING PLAYFUL SHAPES — background decoration */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {FLOATING_SHAPES.map(shape => (
          <div
            key={shape.id}
            className="absolute select-none"
            style={{
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              fontSize: shape.size,
              opacity: 0.12,
              animation: `qp-float ${shape.duration}s ease-in-out ${shape.delay}s infinite`,
              willChange: 'transform',
            }}
          >
            {shape.emoji}
          </div>
        ))}
      </div>

      {/* FLOATING REACTIONS — z-[100] */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        {floatingReactions.map(r => (
          <div
            key={r.id}
            className="absolute text-5xl select-none"
            style={{
              left: `${r.x}%`,
              bottom: 0,
              animation: 'qp-reaction-float 3s ease-out forwards',
              willChange: 'transform, opacity',
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* RECONNECTION OVERLAY */}
      {disconnected && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
          style={{ background: 'rgba(15,5,36,0.95)', backdropFilter: 'blur(12px)', animation: 'qp-fade-in 0.3s ease both' }}
        >
          <div
            className="w-12 h-12 rounded-full border-4 border-purple-500/30 border-t-purple-500 mb-4"
            style={{ animation: 'qp-spin 1.5s linear infinite', willChange: 'transform' }}
          />
          <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Fredoka,sans-serif' }}>Reconnecting...</h3>
          <p className="text-gray-400 text-sm">Hang tight, getting you back in the game</p>
        </div>
      )}

      {/* T1-C: KICKED OVERLAY */}
      {kickedOverlay && (
        <div className="fixed inset-0 z-[600] flex flex-col items-center justify-center"
          style={{ background: 'rgba(15,5,36,0.97)', backdropFilter: 'blur(16px)' }}>
          <div className="text-7xl mb-6">🚫</div>
          <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: 'Fredoka,sans-serif' }}>You were removed</h2>
          <p className="text-gray-300 text-lg mb-8 text-center px-8">{kickedOverlay.reason}</p>
          <div className="flex gap-4">
            <button onClick={() => { send({ type: 'rejoin_request' }); setKickedOverlay(null); }}
              className="px-8 py-3 rounded-xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
              Request Rejoin
            </button>
            <button onClick={() => { setKickedOverlay(null); localStorage.removeItem('participantId'); localStorage.removeItem('participantName'); navigate('/'); }}
              className="px-8 py-3 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20">
              Leave
            </button>
          </div>
        </div>
      )}

      {/* T2-B: FIRST CORRECT BANNER */}
      {firstCorrectBanner && (
        <div className="first-correct-banner" onClick={() => setFirstCorrectBanner(null)}>
          <div className="px-6 py-4 text-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 4px 20px rgba(124,58,237,0.5)' }}>
            <span className="text-white font-black text-lg" style={{ fontFamily: 'Fredoka,sans-serif' }}>
              ⚡ {firstCorrectBanner} answered first!
            </span>
          </div>
        </div>
      )}

      {/* T2-C: STREAK MILESTONE BANNER */}
      {streakBanner && (
        <div className={`streak-banner badge-${streakBanner.badge}`} onClick={() => setStreakBanner(null)}>
          <div className="py-6 text-center">
            <div className="text-white font-black text-4xl md:text-6xl" style={{ fontFamily: 'Fredoka One,Fredoka,sans-serif', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              {streakBanner.badge === 'hot' ? '🔥' : streakBanner.badge === 'fire' ? '🔥🔥' : '⚡👑⚡'}
            </div>
            <div className="text-white font-black text-2xl md:text-4xl mt-2" style={{ fontFamily: 'Fredoka,sans-serif', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
              {streakBanner.playerName} — {streakBanner.streak} streak!
            </div>
            <div className="text-white/80 font-bold text-lg mt-1 uppercase tracking-wider">
              {streakBanner.badge === 'hot' ? 'On Fire!' : streakBanner.badge === 'fire' ? 'UNSTOPPABLE!' : '🏆 LEGENDARY 🏆'}
            </div>
          </div>
        </div>
      )}

      {/* 5-SECOND COUNTDOWN OVERLAY
          Shows as soon as countdown_start arrives (z-[500]).
          Each tick re-keys the number div to replay the entrance animation. */}
      {isCountingDown && countdownValue !== null && (
        <div
          className="fixed inset-0 z-[500] flex flex-col items-center justify-center"
          style={{ background: 'rgba(124, 77, 255, 0.92)', backdropFilter: 'blur(8px)', animation: 'qp-fade-in 0.25s ease both' }}
        >
          <div
            key={`cd-${countdownValue}`}
            style={{ animation: 'qp-countdown-number 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            <span style={{
              fontFamily: 'Fredoka One, Fredoka, sans-serif',
              fontSize: 'clamp(6rem, 30vw, 12rem)',
              color: '#FFFFFF',
              display: 'block',
              textAlign: 'center',
              lineHeight: 1,
              textShadow: '0 6px 40px rgba(0,0,0,0.35)',
            }}>
              {countdownValue}
            </span>
          </div>
          <p
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(1rem, 4vw, 1.5rem)',
              color: 'rgba(255,255,255,0.9)',
              marginTop: '24px',
              animation: 'qp-pulse-opacity 1.2s ease-in-out infinite',
              willChange: 'opacity',
            }}
          >
            Get Ready! 🚀
          </p>
        </div>
      )}

      {/* Fullscreen score screen */}
      {!isAdmin && answered && !showAnswerReveal && result && (
        <div
          className="fixed inset-0 z-30 flex flex-col items-center justify-center p-6"
          style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)', animation: 'qp-score-enter 0.3s ease both' }}
        >
          {result.correct ? (
            <>
              <div
                className="text-8xl mb-6"
                style={{ animation: 'qp-correct-bounce 0.6s ease both', willChange: 'transform' }}
              >✅</div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-2" style={{ fontFamily: 'Fredoka,sans-serif' }}>Correct!</h2>
              <div
                className="text-center"
                style={{ animation: 'qp-slide-up 0.4s 0.3s ease both' }}
              >
                <div className="text-6xl md:text-7xl font-black text-yellow-300 mb-2">+{result.points}</div>
                <div className="text-white/80 text-lg">
                  {result.basePoints} base + {result.timeBonus} speed
                  {result.streakBonus > 0 && ` + ${result.streakBonus} 🔥 streak`}
                </div>
              </div>
              <div className="mt-8 rounded-2xl px-8 py-4 text-center" style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)' }}>
                <div className="text-gray-400 text-sm">Total Score</div>
                <div className="text-4xl font-black text-white">{score}</div>
              </div>
              {streak >= 3 && (
                <div
                  className="mt-4 flex items-center gap-2 bg-orange-500/80 rounded-full px-5 py-2"
                  style={{ animation: 'qp-streak-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
                >
                  <Flame className="w-5 h-5 text-yellow-200" />
                  <span className="text-white font-bold">{streak} streak!</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="text-8xl mb-6"
                style={{ animation: 'qp-wrong-shake 0.4s ease both' }}
              >❌</div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4" style={{ fontFamily: 'Fredoka,sans-serif' }}>
                {selectedOption === null || selectedOption === -1 ? "Time's up!" : 'Wrong!'}
              </h2>
              <div className="text-gray-400 text-xl">Better luck next question!</div>
            </>
          )}
          <p
            className="absolute bottom-8 text-gray-500 text-sm"
            style={{ animation: 'qp-pulse-opacity 1.5s ease-in-out infinite', willChange: 'opacity' }}
          >Waiting for others...</p>
        </div>
      )}

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
              <div
                className={`relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center flex-shrink-0 ${timeWarningActive ? 'time-warning-active' : ''}`}
                style={timeLeft <= 5 && timeLeft > 0 ? { animation: 'qp-timer-pulse 0.5s ease-in-out infinite', willChange: 'transform' } : {}}
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
              </div>
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

            {/* Admin answered count — T1-B: SVG arc */}
            {isAdmin && totalParticipants > 0 && (
              <div className="flex items-center gap-2">
                <svg width="36" height="36" viewBox="0 0 36 36" className={allAnsweredFlash ? 'arc-flash-green' : ''}>
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle className="arc-progress" cx="18" cy="18" r="15" fill="none"
                    stroke={allAnsweredFlash ? '#10B981' : '#7C3AED'}
                    strokeWidth="3"
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - answerPercentage / 100)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                  />
                  <text x="18" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Fredoka,sans-serif">{answerPercentage}%</text>
                </svg>
                <span className="text-gray-400 text-xs">{answeredCount}/{totalParticipants}</span>
              </div>
            )}

            {/* Streak */}
            {!isAdmin && streak >= 3 && (
              <div
                className="flex items-center gap-1 bg-orange-500/80 rounded-full px-2 py-1"
                style={{ animation: 'qp-streak-hud-pulse 1.5s ease-in-out infinite', willChange: 'transform' }}
              >
                <Flame className="w-3 h-3 text-yellow-200" />
                <span className="text-white text-xs font-bold">{streak}🔥</span>
              </div>
            )}

            {/* Mute */}
            <button onClick={toggleMute}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Answer progress bar — T1-B: uses answerPercentage */}
        {!showAnswerReveal && totalParticipants > 0 && (
          <div className="h-0.5 bg-white/10 mt-2">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full"
              style={{ width: `${answerPercentage}%`, transition: 'width 0.4s ease' }}
            />
          </div>
        )}
      </div>

      {/* QUESTION + ANSWERS — hidden during countdown */}
      {!isCountingDown && currentQuestion && (
        <div className="pt-24 pb-24 px-4">
          <div className="max-w-4xl mx-auto">

            {/* Question card */}
            <div
              key={`q-${questionKey}`}
              className="rounded-2xl p-4 sm:p-6 md:p-10 text-center mb-4 relative overflow-hidden min-h-[100px] flex flex-col items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(124,58,237,0.3)',
                boxShadow: '0 0 40px rgba(124,58,237,0.1)',
                animation: 'qp-question-enter 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
              }}
            >
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-purple-500/40 rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-purple-500/40 rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-purple-500/40 rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-500/40 rounded-br-2xl" />

              {/* Sparkle accent */}
              <div
                className="absolute top-3 right-3 text-purple-400/30"
                style={{ animation: 'qp-sparkle-spin 4s ease-in-out infinite', willChange: 'transform' }}
              >
                <Sparkles className="w-5 h-5" />
              </div>

              {currentQuestion.media && (
                <img src={currentQuestion.media} alt="Question" className="w-full max-h-48 object-contain rounded-xl mb-4" />
              )}
              <h2 className="text-white font-bold leading-snug break-words w-full"
                style={{ fontFamily: 'Fredoka, sans-serif', fontSize: 'clamp(1rem, 3.5vw, 2rem)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                {currentQuestion.question}
              </h2>
            </div>

            {/* Answer grid — responsive: single column on mobile, 2 cols on larger screens */}
            <div className={`grid gap-3 ${isTrueFalse ? 'grid-cols-1 max-w-xl mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {currentQuestion.options?.map((option, idx) => {
                const color = ANSWER_COLORS[idx] || ANSWER_COLORS[0];
                const isSelected = selectedOption === idx;
                const correctAnswer = result?.correctAnswer;
                const isCorrect = showAnswerReveal && (Array.isArray(correctAnswer) ? correctAnswer.includes(idx) : correctAnswer === idx);
                const isWrong = showAnswerReveal && isSelected && !isCorrect;

                return (
                  <button key={idx}
                    className="relative rounded-2xl overflow-hidden text-left transition-all"
                    onClick={() => !answered && !isAdmin && setSelectedOption(idx)}
                    disabled={answered || isAdmin}
                    style={{
                      minHeight: '60px',
                      background: isCorrect ? '#10B981' : isWrong ? '#EF4444' : showAnswerReveal ? `${color.bg}60` : color.bg,
                      border: isSelected && !showAnswerReveal ? '3px solid white'
                        : isCorrect ? '3px solid #6EE7B7' : isWrong ? '3px solid #FCA5A5' : '3px solid transparent',
                      boxShadow: isSelected && !showAnswerReveal
                        ? `0 8px 25px ${color.glow || color.bg + '60'}, 0 0 0 1px rgba(255,255,255,0.2)`
                        : isCorrect ? '0 4px 20px rgba(16,185,129,0.4)'
                        : 'none',
                      opacity: showAnswerReveal && !isCorrect && !isSelected ? 0.5 : 1,
                      animation: `qp-option-enter 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.1 + idx * 0.07}s both`,
                    }}
                  >
                    <div className="flex items-center gap-3 p-3 sm:p-4">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0 text-lg">
                        {ANSWER_EMOJIS[idx] || '🔵'}
                      </div>
                      <span className="text-white font-bold leading-tight break-words"
                        style={{ fontSize: 'clamp(0.85rem, 2.2vw, 1.15rem)', overflowWrap: 'anywhere', wordBreak: 'break-word', flex: 1 }}>
                        {isTrueFalse ? (idx === 0 ? 'True' : 'False') : option}
                      </span>
                      {/* T1-A: answer_confirmed ✓ icon */}
                      {answerConfirmed && isSelected && !showAnswerReveal && (
                        <div
                          className="ml-auto flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                          style={{ animation: 'qp-check-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
                        >
                          <Check className="w-5 h-5 text-white" strokeWidth={3} />
                        </div>
                      )}
                      {showAnswerReveal && (isCorrect || isWrong) && (
                        <div
                          className="ml-auto flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                          style={{ animation: 'qp-check-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
                        >
                          {isCorrect ? <Check className="w-5 h-5 text-white" strokeWidth={3} />
                            : <X className="w-5 h-5 text-white" strokeWidth={3} />}
                        </div>
                      )}
                    </div>
                    {/* T1-A: float-up points */}
                    {answerConfirmed && isSelected && (
                      <div className="float-up-points" style={{ top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'qp-points-up 1.5s ease-out forwards' }}>
                        +{answerConfirmed.points} pts
                      </div>
                    )}
                    {isSelected && !showAnswerReveal && !answerConfirmed && (
                      <div
                        className="absolute inset-0 bg-white/10"
                        style={{ animation: 'qp-shimmer-pulse 1.2s ease-in-out infinite', willChange: 'opacity' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Answer distribution */}
            {showAnswerReveal && Object.keys(answerStats).length > 0 && (
              <div
                className="mt-4 rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', animation: 'qp-dist-enter 0.4s 0.3s ease both' }}
              >
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
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2"
                            style={{
                              width: `${pct}%`,
                              background: isC ? '#10B981' : (ANSWER_COLORS[idx]?.bg || '#888') + '90',
                              animation: `qp-bar-grow 0.8s ${0.2 + idx * 0.1}s ease both`,
                            }}
                          >
                            {pct > 15 && <span className="text-white text-xs font-bold">{pct}%</span>}
                          </div>
                        </div>
                        <span className="text-gray-400 text-xs w-12 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submit button */}
            {!isAdmin && !answered && selectedOption !== null && (
              <div
                className="mt-4 flex justify-center"
                style={{ animation: 'qp-slide-down-fade 0.3s ease both' }}
              >
                <button onClick={handleSubmit}
                  className="px-10 py-4 rounded-2xl text-xl font-black text-white transition-all"
                  style={{ fontFamily: 'Fredoka,sans-serif', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 8px 24px rgba(124,58,237,0.5)' }}>
                  <Zap className="w-5 h-5 inline mr-2" /> Submit Answer
                </button>
              </div>
            )}

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
      )}

      {/* REACTION BUTTONS — Always visible for participants */}
      {!isAdmin && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
          {['🔥', '😱', '👏', '💪', '🤔', '😂'].map(emoji => (
            <button key={emoji}
              onClick={() => sendReaction(emoji)}
              disabled={myReactionCooldown}
              className="w-11 h-11 text-2xl bg-white/20 backdrop-blur-sm rounded-full border border-white/30 hover:bg-white/30 active:scale-90 transition-all disabled:opacity-40">
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizPlay;