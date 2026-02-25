// frontend/src/pages/QuizLobby.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import {
  Users, Play, Crown, Sparkles, Copy, QrCode, Share2,
  Volume2, VolumeX, LogOut, Trophy, Shuffle, UserX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DicebearAvatar from '@/components/ui/avatar/DicebearAvatar';
import { saveAvatarSeed } from '@/utils/avatar';
import { useSocket } from '../context/SocketContext';
import { bgMusic } from '@/utils/bgMusic';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const QuizLobby = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  
  const [quiz, setQuiz] = useState(null);
  const [participants, setParticipants] = useState([]);
  const { socket, isConnected, connect, send, addListener, disconnect } = useSocket();
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const participantId = localStorage.getItem('participantId');
  const participantName = localStorage.getItem('participantName');
  const avatarSeed = localStorage.getItem('avatarSeed') || '';
  
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${window.location.origin}/join?code=${code}`;
  const joinUrl = `${window.location.origin}/join?code=${code}`;

  const quizNotStarted = countdown === null;

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('📋 Game PIN copied!');
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.6 }
    });
  };

  const shareQuiz = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: quiz?.title,
          text: `Join my quiz! Game PIN: ${code}`,
          url: joinUrl
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(joinUrl);
          toast.success('Join link copied!');
        }
      }
    } else {
      navigator.clipboard.writeText(joinUrl);
      toast.success('Join link copied!');
    }
  };

  const handleRandomizeAvatar = async () => {
    if (!quizNotStarted || isAdmin) return;
    
    setRerolling(true);
    try {
      const response = await axios.post(`${API}/avatar/reroll`, {
        quizCode: code,
        participantId: participantId
      });
      
      const newSeed = response.data.seed;
      localStorage.setItem('avatarSeed', newSeed);
      saveAvatarSeed(newSeed);
      
      toast.success('🎲 Avatar randomized!');
      confetti({
        particleCount: 30,
        spread: 40,
        origin: { y: 0.6 }
      });
      
    } catch (error) {
      console.error('Reroll error:', error);
      toast.error(error.response?.data?.error || 'Failed to randomize avatar');
    } finally {
      setRerolling(false);
    }
  };

  const fetchQuizDetails = useCallback(async () => {
    try {
      let response;
      if (isAdmin) {
        const token = localStorage.getItem('adminToken');
        response = await axios.get(`${API}/admin/quiz/${code}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        response = await axios.get(`${API}/quiz/${code}/info`);
      }
      setQuiz(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Fetch quiz error:', error);
      toast.error('Failed to load quiz');
      navigate(isAdmin ? '/admin' : '/');
    }
  }, [code, navigate, isAdmin]);

  const fetchParticipants = useCallback(async () => {
    try {
      let response;
      if (isAdmin) {
        const token = localStorage.getItem('adminToken');
        response = await axios.get(`${API}/admin/quiz/${code}/participants`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        response = await axios.get(`${API}/quiz/${code}/participants/public`);
      }
      if (response.data.participants) {
        setParticipants(response.data.participants);
      }
    } catch (error) {
      console.error('Fetch participants error:', error);
    }
  }, [code, isAdmin]);

  useEffect(() => {
    if (!isConnected) {
      connect(code, participantId, isAdmin, participantName, avatarSeed);
    }
  }, [isConnected, code, participantId, isAdmin, connect, participantName, avatarSeed]);

  // Start lobby music
  useEffect(() => {
    bgMusic.startLobby();
    return () => bgMusic.stop();
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    const cleanupParticipantJoined = addListener('participant_joined', (data) => {
      setParticipants(prev => {
        const exists = prev.find(p => p.id === data.participant.id);
        if (!exists) {
          confetti({
            particleCount: 30,
            spread: 40,
            origin: { x: Math.random(), y: 0.6 }
          });
          toast.success(`${data.participant.name} joined! 🎉`);
          return [...prev, data.participant];
        }
        return prev;
      });
    });

    const cleanupAllParticipants = addListener('all_participants', (data) => {
      setParticipants(data.participants || []);
    });

    const cleanupAvatarUpdated = addListener('avatar_updated', (data) => {
      setParticipants(prev => prev.map(p => 
        p.id === data.participantId 
          ? { ...p, avatarSeed: data.avatarSeed }
          : p
      ));
    });

    const cleanupQuizStarting = addListener('quiz_starting', () => {
      // Navigate immediately — server state is already set when broadcast fires
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      navigate(`/quiz/${code}`);
    });

    // Auto-redirect if quiz is already in progress (late join or reconnect)
    const cleanupSyncState = addListener('sync_state', (data) => {
      if (data.quiz_state && data.quiz_state !== 'lobby') {
        navigate(`/quiz/${code}`);
      }
    });

    const cleanupCountdownStart = addListener('countdown_start', () => {
      navigate(`/quiz/${code}`);
    });

    const cleanupCountdownTick = addListener('countdown_tick', () => {
      navigate(`/quiz/${code}`);
    });

    // Quiz ended — redirect
    const cleanupQuizEnded = addListener('quiz_ended', () => {
      toast.info('📢 Quiz has been ended');
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    });

    // Player kicked — remove from list or redirect self
    const cleanupKicked = addListener('participant_kicked', (data) => {
      setParticipants(prev => prev.filter(p => p.id !== data.participantId));
      if (!isAdmin && data.participantId === participantId) {
        localStorage.removeItem('participantId');
        localStorage.removeItem('participantName');
        toast.error('You have been removed from this quiz by the host');
        navigate('/');
      } else if (isAdmin) {
        toast.success(`${data.name} was removed`);
      }
    });

    return () => {
      cleanupParticipantJoined();
      cleanupAllParticipants();
      cleanupAvatarUpdated();
      cleanupQuizStarting();
      cleanupSyncState();
      cleanupCountdownStart();
      cleanupCountdownTick();
      cleanupQuizEnded();
      cleanupKicked();
    };
  }, [socket, addListener]);

  useEffect(() => {
    if (!participantId && !isAdmin) {
      toast.error('Please join the quiz first');
      navigate('/join');
      return;
    }

    fetchQuizDetails();
    fetchParticipants();
  }, [participantId, isAdmin, navigate, fetchQuizDetails, fetchParticipants]);

  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      navigate(`/quiz/${code}`);
    }
  }, [countdown, code, navigate]);

  const handleStartQuiz = () => {
    if (participants.length === 0) {
      toast.error('⚠️ No participants yet!');
      return;
    }

    if (socket) {
      send({ type: 'quiz_starting' });
      // Navigate immediately — the WS broadcast will fire on the quiz page
      navigate(`/quiz/${code}`);
    } else {
      toast.error('❌ Connection lost');
    }
  };

  const handleLeaveQuiz = () => {
    disconnect();
    localStorage.removeItem('participantId');
    localStorage.removeItem('participantName');
    // NOTE: intentionally NOT removing avatarSeed so returning players keep the same avatar
    if (isAdmin) {
      localStorage.removeItem('isAdmin');
    }
    navigate('/');
  };

  const handleKickPlayer = (participant) => {
    if (!socket) return;
    send({ type: 'kick_player', participantId: participant.id });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-900 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-20 h-20 border-8 border-white border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: Math.random() * 0.5 + 0.5,
              opacity: Math.random() * 0.3
            }}
            animate={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{ 
              duration: Math.random() * 20 + 10,
              repeat: Infinity,
              repeatType: "reverse"
            }}
          >
            <div 
              className="w-4 h-4 bg-white rounded-full blur-sm"
              style={{ opacity: Math.random() * 0.3 }}
            />
          </motion.div>
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 p-4 md:p-6 flex justify-between items-center">
        <motion.div
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex items-center gap-2 md:gap-3"
        >
          <div className="w-12 h-12 md:w-16 md:h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
            <Trophy className="w-6 h-6 md:w-8 md:h-8 text-yellow-300" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm md:text-lg">Quiz Lobby</h3>
            <div className="flex items-center gap-2">
              <p className="text-white/70 text-xs md:text-sm">PIN: {code}</p>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex items-center gap-2"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsMuted(!isMuted);
              bgMusic.setMuted(!isMuted);
            }}
            className="bg-white/20 border-white/40 text-white hover:bg-white/30 rounded-full h-10 w-10 md:h-12 md:w-12"
          >
            {isMuted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLeaveQuiz}
            className="bg-red-500/80 hover:bg-red-600 text-white rounded-full h-10 w-10 md:h-12 md:w-12"
          >
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 px-4 md:px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-4 md:mb-6"
          >
            <motion.div
              animate={{ 
                rotate: [0, 5, -5, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block mb-3 md:mb-4"
            >
              <div className="w-16 h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center shadow-2xl">
                <Sparkles className="w-10 h-10 md:w-14 md:h-14 text-purple-600" />
              </div>
            </motion.div>
            
            <h1 
              className="text-4xl md:text-7xl font-black text-white mb-2 md:mb-4 drop-shadow-lg"
              style={{ fontFamily: 'Fredoka, sans-serif' }}
            >
              {quiz?.title}
            </h1>
            
            {quiz?.description && (
              <p className="text-lg md:text-2xl text-white/90 mb-4 md:mb-6">{quiz.description}</p>
            )}

            {/* EQ Bars — lobby vibe */}
            <div className="flex items-end justify-center gap-1 h-8 mb-4">
              {[1,2,3,4,5,6,7].map(i => (
                <motion.div key={i}
                  className="w-2 bg-white/40 rounded-full"
                  animate={{ height: ['20%', '100%', '60%', '80%', '20%'] }}
                  transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                />
              ))}
            </div>

            {/* Game PIN Card */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl shadow-2xl p-4 md:p-8 max-w-2xl mx-auto mb-4 md:mb-8"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
                <div className="flex-1 text-center md:text-left w-full">
                  <p className="text-xs md:text-sm font-bold text-purple-600 uppercase tracking-wider mb-2">
                    Game PIN
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-2 md:gap-4">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="text-4xl md:text-6xl font-black text-purple-900 tracking-wider cursor-pointer select-all"
                      onClick={copyCode}
                    >
                      {code}
                    </motion.div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={copyCode}
                      className="h-10 w-10 md:h-12 md:w-12"
                    >
                      <Copy className="w-5 h-5 md:w-6 md:h-6" />
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-3 md:mt-4 justify-center md:justify-start">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={shareQuiz}
                      className="text-xs md:text-sm"
                    >
                      <Share2 className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                      Share
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQR(!showQR)}
                      className="text-xs md:text-sm"
                    >
                      <QrCode className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                      QR Code
                    </Button>
                  </div>
                </div>
                
                <AnimatePresence>
                  {showQR && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl shadow-xl"
                    >
                      <img 
                        src={qrCodeUrl} 
                        alt="QR Code"
                        className="w-32 h-32 md:w-40 md:h-40 rounded-lg"
                      />
                      <p className="text-xs text-center text-gray-600 mt-2">Scan to join</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Quiz Stats */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-4 gap-2 md:gap-4 max-w-3xl mx-auto"
            >
              <Card className="bg-white/10 backdrop-blur-md border-white/20 p-2 md:p-4">
                <div className="text-2xl md:text-4xl font-black text-white">{quiz?.questionsCount || 0}</div>
                <div className="text-xs md:text-sm font-semibold text-white/80 mt-1">Questions</div>
              </Card>
              <Card className="bg-white/10 backdrop-blur-md border-white/20 p-2 md:p-4">
                <div className="text-2xl md:text-4xl font-black text-green-300">{participants.length}</div>
                <div className="text-xs md:text-sm font-semibold text-white/80 mt-1">Players</div>
              </Card>
              <Card className="bg-white/10 backdrop-blur-md border-white/20 p-2 md:p-4">
                <div className="text-2xl md:text-4xl font-black text-orange-300">{quiz?.duration || 0}</div>
                <div className="text-xs md:text-sm font-semibold text-white/80 mt-1">Minutes</div>
              </Card>
              <Card className="bg-white/10 backdrop-blur-md border-white/20 p-2 md:p-4">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-3 h-3 md:w-4 md:h-4 bg-green-400 rounded-full mx-auto mb-1"
                />
                <div className="text-xs md:text-sm font-semibold text-white/80">Live</div>
              </Card>
            </motion.div>
          </motion.div>

          {/* WORD CLOUD STYLE PARTICIPANTS */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/10 backdrop-blur-md rounded-2xl md:rounded-3xl shadow-2xl p-4 md:p-8 border-2 border-white/20"
          >
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="flex items-center gap-2 md:gap-3">
                <Users className="w-6 h-6 md:w-8 md:h-8 text-white" />
                <h2 className="text-xl md:text-3xl font-black text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  Players
                </h2>
              </div>
              
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="bg-green-500 text-white px-3 py-1 md:px-4 md:py-2 rounded-full font-bold text-sm md:text-lg">
                  {participants.length}
                </div>
              </motion.div>
            </div>

            {participants.length === 0 ? (
              <div className="text-center py-12 md:py-20">
                <motion.div
                  animate={{ 
                    y: [0, -20, 0],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Users className="w-24 h-24 md:w-32 md:h-32 text-white/30 mx-auto mb-4 md:mb-6" />
                </motion.div>
                <h3 className="text-2xl md:text-3xl font-bold text-white/60 mb-2">
                  Waiting for players...
                </h3>
                <p className="text-base md:text-xl text-white/40">
                  Share the game PIN!
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center items-center gap-3 md:gap-6 max-h-[50vh] md:max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence>
                  {participants.map((participant, index) => {
                    const isCurrentPlayer = participant.id === participantId;
                    
                    return (
                      <motion.div
                        key={participant.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ 
                          type: "spring",
                          delay: index * 0.03,
                          duration: 0.5
                        }}
                        className="relative"
                      >
                        <div className={`
                          flex flex-col items-center gap-2 p-2 md:p-3 rounded-2xl transition-all group
                          ${isCurrentPlayer ? 'bg-yellow-400/20 ring-2 md:ring-4 ring-yellow-400 scale-110' : 'bg-white/10'}
                        `}>
                          {index === 0 && (
                            <motion.div
                              initial={{ scale: 0, rotate: -180 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className="absolute -top-2 -right-2 z-10"
                            >
                              <div className="bg-yellow-400 text-purple-900 rounded-full p-1.5 md:p-2 shadow-lg">
                                <Crown className="w-3 h-3 md:w-4 md:h-4" />
                              </div>
                            </motion.div>
                          )}
                          
                          <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="relative"
                          >
                            <DicebearAvatar 
                              seed={participant.avatarSeed}
                              size="lg"
                              className="shadow-lg w-12 h-12 md:w-16 md:h-16"
                            />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
                          </motion.div>
                          
                          <div className="text-center">
                            <p className="font-bold text-white text-xs md:text-sm truncate max-w-[80px] md:max-w-[100px]">
                              {participant.name}
                              {isCurrentPlayer && ' (You)'}
                            </p>
                          </div>

                          {/* Kick button for admin - visible on hover */}
                          {isAdmin && quizNotStarted && !isCurrentPlayer && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleKickPlayer(participant); }}
                              className="absolute -top-1 -left-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                              title={`Kick ${participant.name}`}
                            >
                              <UserX className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>

          {/* Randomize Avatar Button */}
          {!isAdmin && quizNotStarted && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center mt-4 md:mt-6"
            >
              <Button
                onClick={handleRandomizeAvatar}
                disabled={rerolling}
                variant="outline"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2 text-sm md:text-base"
                size="sm"
              >
                <Shuffle className="w-4 h-4 md:w-5 md:h-5" />
                {rerolling ? 'Randomizing...' : '🎲 Randomize Avatar'}
              </Button>
            </motion.div>
          )}

          {/* Start Button */}
          {isAdmin && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 md:mt-8 text-center"
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={handleStartQuiz}
                  disabled={participants.length === 0 || countdown !== null}
                  size="lg"
                  className="bg-white text-purple-600 hover:bg-gray-100 font-black text-xl md:text-3xl px-8 md:px-16 py-6 md:py-8 rounded-full shadow-2xl disabled:opacity-50"
                  style={{ fontFamily: 'Fredoka, sans-serif' }}
                >
                  <Play className="w-6 h-6 md:w-10 md:h-10 mr-2 md:mr-4" />
                  {countdown !== null ? `Starting ${countdown}...` : 'Start Quiz'}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Waiting Message */}
          {!isAdmin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 md:mt-8 text-center"
            >
              <motion.p
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-lg md:text-2xl font-bold text-white/80"
              >
                ⏳ Waiting for host...
              </motion.p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 180 }}
              transition={{ type: "spring", duration: 0.6 }}
              className="text-center"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 360]
                }}
                transition={{ duration: 1 }}
                className="text-[150px] md:text-[250px] font-black text-white mb-4 md:mb-8 leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif' }}
              >
                {countdown}
              </motion.div>
              <motion.p
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="text-3xl md:text-5xl font-bold text-white/90"
              >
                Get Ready!
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
};

export default QuizLobby;