// FinalPodium.js
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Star, Home, BarChart3, XCircle, TrendingUp, Download } from 'lucide-react';
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
import { API_BASE_URL } from '../config';

const API = `${API_BASE_URL}/api`;

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

    // T1-C: you_were_kicked — handle kick with full-screen overlay
    const off3 = addListener('you_were_kicked', (d) => {
      localStorage.removeItem('participantId');
      localStorage.removeItem('participantName');
      toast.error(d.reason || 'You have been removed from this quiz');
      navigate('/');
    });

    return () => { off1(); off2(); off3(); };
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

  const downloadQuizStatsPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 16;
      let y = 0;

      // Purple gradient background header
      doc.setFillColor(88, 28, 135); // purple-900
      doc.rect(0, 0, pageW, 38, 'F');
      doc.setFillColor(67, 20, 108);
      doc.rect(0, 20, pageW, 18, 'F');

      // Trophy icon area
      doc.setFillColor(251, 191, 36); // yellow-400
      doc.circle(pageW / 2, 19, 10, 'F');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('🏆', pageW / 2, 21.5, { align: 'center' });

      // Title
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(253, 224, 71); // yellow-300
      doc.text('Quiz Statistics', pageW / 2, 32, { align: 'center' });

      y = 46;

      // Quiz code subtitle
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 80, 180);
      doc.text(`Quiz Code: ${code}`, pageW / 2, y, { align: 'center' });
      y += 10;

      // Stats cards row
      if (quizStats) {
        const cards = [
          { label: 'Players', value: String(quizStats.totalParticipants), bg: [243, 232, 255], text: [126, 34, 206] },
          { label: 'Questions', value: String(quizStats.totalQuestions), bg: [219, 234, 254], text: [29, 78, 216] },
          { label: 'Avg Score', value: String(quizStats.averageScore), bg: [220, 252, 231], text: [21, 128, 61] },
          { label: 'Completed', value: `${quizStats.completionRate}%`, bg: [255, 237, 213], text: [194, 65, 12] },
        ];

        const cardW = (pageW - margin * 2 - 9) / 4;
        cards.forEach((card, i) => {
          const x = margin + i * (cardW + 3);
          doc.setFillColor(...card.bg);
          doc.roundedRect(x, y, cardW, 22, 3, 3, 'F');
          doc.setFontSize(15);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...card.text);
          doc.text(card.value, x + cardW / 2, y + 11, { align: 'center' });
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 100, 100);
          doc.text(card.label, x + cardW / 2, y + 18, { align: 'center' });
        });
        y += 30;
      }

      // Leaderboard section header
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(88, 28, 135);
      doc.text('🏆  Full Leaderboard', margin, y);
      y += 8;

      // Leaderboard table header
      doc.setFillColor(88, 28, 135);
      doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('#', margin + 4, y + 5.5);
      doc.text('Name', margin + 16, y + 5.5);
      doc.text('Time (s)', pageW - margin - 34, y + 5.5);
      doc.text('Score', pageW - margin - 10, y + 5.5, { align: 'right' });
      y += 10;

      // Leaderboard rows
      fullLeaderboard.forEach((entry, index) => {
        if (y > pageH - 20) {
          doc.addPage();
          y = margin;
        }

        const rowBg =
          index === 0 ? [254, 249, 195] :
          index === 1 ? [243, 244, 246] :
          index === 2 ? [255, 237, 213] :
          index % 2 === 0 ? [249, 250, 251] : [255, 255, 255];

        doc.setFillColor(...rowBg);
        doc.roundedRect(margin, y, pageW - margin * 2, 9, 1.5, 1.5, 'F');

        // Rank badge
        const rankBg =
          index === 0 ? [251, 191, 36] :
          index === 1 ? [156, 163, 175] :
          index === 2 ? [251, 146, 60] :
          [209, 213, 219];
        doc.setFillColor(...rankBg);
        doc.circle(margin + 4, y + 4.5, 3.5, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(index < 3 ? 255 : 80, index < 3 ? 255 : 80, index < 3 ? 255 : 80);
        doc.text(String(index + 1), margin + 4, y + 6, { align: 'center' });

        // Name
        doc.setFontSize(9);
        doc.setFont('helvetica', index < 3 ? 'bold' : 'normal');
        doc.setTextColor(30, 30, 30);
        const nameText = entry.name.length > 28 ? entry.name.substring(0, 25) + '...' : entry.name;
        doc.text(nameText, margin + 12, y + 5.5);

        // Time
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${entry.totalTime.toFixed(1)}s`, pageW - margin - 34, y + 5.5);

        // Score badge
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageW - margin - 18, y + 1, 16, 7, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(String(entry.score), pageW - margin - 10, y + 5.8, { align: 'right' });

        y += 11;
      });

      // Footer
      y = Math.max(y + 6, pageH - 14);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(160, 160, 160);
      doc.text(`Generated on ${new Date().toLocaleDateString()} • Quiz Code: ${code}`, pageW / 2, pageH - 8, { align: 'center' });

      doc.save(`quiz-stats-${code}.pdf`);
      toast.success('Quiz stats PDF downloaded!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const downloadMyStatsPDF = async () => {
    if (!myResult) {
      toast.error('Your result data is not available');
      return;
    }
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 16;
      let y = 0;

      // Header background
      doc.setFillColor(88, 28, 135);
      doc.rect(0, 0, pageW, 38, 'F');
      doc.setFillColor(67, 20, 108);
      doc.rect(0, 20, pageW, 18, 'F');

      // Star icon circle
      doc.setFillColor(251, 191, 36);
      doc.circle(pageW / 2, 19, 10, 'F');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('⭐', pageW / 2, 21.5, { align: 'center' });

      // Title
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(253, 224, 71);
      doc.text('My Quiz Results', pageW / 2, 32, { align: 'center' });

      y = 46;

      // Quiz code
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 80, 180);
      doc.text(`Quiz Code: ${code}`, pageW / 2, y, { align: 'center' });
      y += 12;

      // Player name banner
      doc.setFillColor(243, 232, 255);
      doc.roundedRect(margin, y, pageW - margin * 2, 14, 3, 3, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(88, 28, 135);
      doc.text(myResult.name, pageW / 2, y + 9, { align: 'center' });
      y += 22;

      // My stats cards
      const myCards = [
        { label: 'My Rank', value: `#${myResult.rank}`, bg: [253, 224, 71], text: [146, 64, 14] },
        { label: 'My Score', value: String(myResult.score), bg: [220, 252, 231], text: [21, 128, 61] },
        { label: 'Total Time', value: `${myResult.totalTime ? myResult.totalTime.toFixed(1) : '-'}s`, bg: [219, 234, 254], text: [29, 78, 216] },
        { label: 'Players', value: String(quizStats?.totalParticipants || fullLeaderboard.length), bg: [243, 232, 255], text: [126, 34, 206] },
      ];

      const cardW = (pageW - margin * 2 - 9) / 4;
      myCards.forEach((card, i) => {
        const x = margin + i * (cardW + 3);
        doc.setFillColor(...card.bg);
        doc.roundedRect(x, y, cardW, 22, 3, 3, 'F');
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...card.text);
        doc.text(card.value, x + cardW / 2, y + 11, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(card.label, x + cardW / 2, y + 18, { align: 'center' });
      });
      y += 30;

      // Leaderboard section header
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(88, 28, 135);
      doc.text('🏆  Full Leaderboard', margin, y);
      y += 8;

      // Table header
      doc.setFillColor(88, 28, 135);
      doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('#', margin + 4, y + 5.5);
      doc.text('Name', margin + 16, y + 5.5);
      doc.text('Time (s)', pageW - margin - 34, y + 5.5);
      doc.text('Score', pageW - margin - 10, y + 5.5, { align: 'right' });
      y += 10;

      fullLeaderboard.forEach((entry, index) => {
        if (y > pageH - 20) {
          doc.addPage();
          y = margin;
        }

        const isMe = entry.participantId === participantId;

        const rowBg = isMe ? [254, 243, 199] :
          index === 0 ? [254, 249, 195] :
          index === 1 ? [243, 244, 246] :
          index === 2 ? [255, 237, 213] :
          index % 2 === 0 ? [249, 250, 251] : [255, 255, 255];

        doc.setFillColor(...rowBg);
        doc.roundedRect(margin, y, pageW - margin * 2, 9, 1.5, 1.5, 'F');

        // Highlight border for "me"
        if (isMe) {
          doc.setDrawColor(251, 191, 36);
          doc.setLineWidth(0.5);
          doc.roundedRect(margin, y, pageW - margin * 2, 9, 1.5, 1.5, 'S');
          doc.setLineWidth(0.2);
          doc.setDrawColor(200, 200, 200);
        }

        const rankBg =
          index === 0 ? [251, 191, 36] :
          index === 1 ? [156, 163, 175] :
          index === 2 ? [251, 146, 60] :
          [209, 213, 219];
        doc.setFillColor(...rankBg);
        doc.circle(margin + 4, y + 4.5, 3.5, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(index < 3 ? 255 : 80, index < 3 ? 255 : 80, index < 3 ? 255 : 80);
        doc.text(String(index + 1), margin + 4, y + 6, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', isMe || index < 3 ? 'bold' : 'normal');
        doc.setTextColor(30, 30, 30);
        const nameText = entry.name.length > 28 ? entry.name.substring(0, 25) + '...' : entry.name;
        doc.text(nameText + (isMe ? ' (You)' : ''), margin + 12, y + 5.5);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${entry.totalTime.toFixed(1)}s`, pageW - margin - 34, y + 5.5);

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageW - margin - 18, y + 1, 16, 7, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(String(entry.score), pageW - margin - 10, y + 5.8, { align: 'right' });

        y += 11;
      });

      // Footer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(160, 160, 160);
      doc.text(`Generated on ${new Date().toLocaleDateString()} • Quiz Code: ${code}`, pageW / 2, pageH - 8, { align: 'center' });

      doc.save(`my-stats-${code}.pdf`);
      toast.success('My stats PDF downloaded!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
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
                    className="flex flex-col items-center w-[30%] md:w-72 podium-card-2nd"
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
                        <h3 className="text-base md:text-3xl font-bold text-white mb-1 md:mb-3 line-clamp-2 break-words px-2" title={winners[1].name}>
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
                        {/* T3-B: Enhanced stats */}
                        <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs text-white/70">
                          {winners[1].accuracy != null && <span>{winners[1].accuracy}% acc</span>}
                          {winners[1].correctAnswers != null && <span>· {winners[1].correctAnswers} correct</span>}
                          {winners[1].longestStreak != null && winners[1].longestStreak > 0 && <span>· {winners[1].longestStreak}🔥</span>}
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
                    className="flex flex-col items-center w-[35%] md:w-80 podium-card-1st"
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
                        <h3 className="text-lg md:text-4xl font-bold text-white mb-2 md:mb-4 line-clamp-2 break-words drop-shadow-lg px-2" title={winners[0].name}>
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
                        {/* T3-B: Enhanced stats */}
                        <div className="flex flex-wrap justify-center gap-2 text-xs md:text-sm text-white/80 mt-1">
                          {winners[0].accuracy != null && <span>{winners[0].accuracy}% accuracy</span>}
                          {winners[0].correctAnswers != null && <span>· {winners[0].correctAnswers} correct</span>}
                          {winners[0].longestStreak != null && winners[0].longestStreak > 0 && <span>· {winners[0].longestStreak}🔥 streak</span>}
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
                    className="flex flex-col items-center w-[30%] md:w-72 podium-card-3rd"
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
                        <h3 className="text-base md:text-3xl font-bold text-white mb-1 md:mb-3 line-clamp-2 break-words px-2" title={winners[2].name}>
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
                        {/* T3-B: Enhanced stats */}
                        <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs text-white/70">
                          {winners[2].accuracy != null && <span>{winners[2].accuracy}% acc</span>}
                          {winners[2].correctAnswers != null && <span>· {winners[2].correctAnswers} correct</span>}
                          {winners[2].longestStreak != null && winners[2].longestStreak > 0 && <span>· {winners[2].longestStreak}🔥</span>}
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

            {localStorage.getItem('participantId') && !localStorage.getItem('isAdmin') && (
              <Button
                onClick={downloadMyStatsPDF}
                size="lg"
                className="bg-emerald-600 text-white hover:bg-emerald-700 font-black text-lg md:text-2xl px-8 md:px-12 py-6 md:py-8 rounded-full shadow-2xl flex items-center gap-2 md:gap-4"
                style={{ fontFamily: "'Fredoka', sans-serif" }}
              >
                <Download className="w-6 h-6 md:w-8 md:h-8" />
                Download My Stats
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
                      size="sm"
                      className="shadow-md w-10 h-10 md:w-12 md:h-12"
                    />

                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-bold text-gray-900 line-clamp-2 break-words" title={entry.name}>{entry.name}</div>
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

            <div className="flex justify-end pt-2">
              <Button
                onClick={downloadQuizStatsPDF}
                className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-base px-6 py-3 rounded-full shadow flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Quiz Stats PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinalPodium;