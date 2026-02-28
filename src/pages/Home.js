import { useNavigate } from 'react-router-dom';
import { Play, Trophy, Zap, Sparkles, Users, Clock, Star, Target, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const Home = () => {
  const navigate = useNavigate();
  const [particles, setParticles] = useState([]);
  const [isHovering, setIsHovering] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [showQuizPrompt, setShowQuizPrompt] = useState(false);
  const [activePlayerCount, setActivePlayerCount] = useState(1247);
  const [countdown, setCountdown] = useState(null);
  const [hostAnimation, setHostAnimation] = useState('wave');
  const audioContextRef = useRef(null);

  // Simulate live player count updates
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePlayerCount(prev => Math.max(1000, prev + Math.floor(Math.random() * 10) - 3));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Show quiz prompt after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowQuizPrompt(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Animate host character
  useEffect(() => {
    const animations = ['wave', 'think', 'excited', 'point'];
    const interval = setInterval(() => {
      setHostAnimation(animations[Math.floor(Math.random() * animations.length)]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Mouse tracking for parallax effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Create particle explosion
  const createExplosion = (e, color = null) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newParticles = Array.from({ length: 25 }, (_, i) => ({
      id: Date.now() + i + Math.random(),
      x: rect.left + x,
      y: rect.top + y,
      angle: (Math.PI * 2 * i) / 25,
      velocity: 2 + Math.random() * 4,
      color: color || ['#FF6B00', '#FF0055', '#9D00FF', '#00FF94'][Math.floor(Math.random() * 4)],
      size: 4 + Math.random() * 8
    }));
    
    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 1000);
  };

  // Simulate sound effect
  const playSound = (frequency = 440, duration = 100, type = 'sine') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration / 1000);
      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + duration / 1000);
    } catch (e) {
      console.log('Audio not supported');
    }
  };

  // Start countdown
  const startCountdown = () => {
    setCountdown(3);
    playSound(523.25, 200, 'square');
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          playSound(783.99, 300, 'square');
          setTimeout(() => {
            navigate('/join');
          }, 500);
          return 0;
        }
        playSound(523.25, 200, 'square');
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div 
      className="quiz-theme relative overflow-x-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #1a0a2e 0%, #0a0514 50%, #000000 100%)',
        minHeight: '100vh',
        perspective: '1000px'
      }}
    >
      {/* Dynamic spotlight that follows cursor on desktop */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none transition-all duration-300"
        style={{
          background: `radial-gradient(circle at ${50 + mousePosition.x / 10}% ${50 + mousePosition.y / 10}%, rgba(255, 107, 0, 0.4) 0%, transparent 50%)`
        }}
      />
      
      {/* Animated grid floor - 3D perspective */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-64 opacity-20"
        style={{
          background: `
            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255, 107, 0, 0.3) 39px, rgba(255, 107, 0, 0.3) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(157, 0, 255, 0.3) 39px, rgba(157, 0, 255, 0.3) 40px)
          `,
          transform: 'rotateX(60deg) translateY(100px)',
          transformOrigin: 'bottom'
        }}
      />

      {/* Particle explosion system */}
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          initial={{ 
            x: particle.x, 
            y: particle.y,
            scale: 1,
            opacity: 1
          }}
          animate={{ 
            x: particle.x + Math.cos(particle.angle) * particle.velocity * 50,
            y: particle.y + Math.sin(particle.angle) * particle.velocity * 50,
            scale: 0,
            opacity: 0
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute pointer-events-none rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            boxShadow: `0 0 10px ${particle.color}`
          }}
        />
      ))}

      {/* Animated host character */}
      <motion.div
        className="absolute left-4 bottom-20 md:left-12 md:bottom-24 z-20 hidden sm:block"
        animate={{
          y: hostAnimation === 'wave' ? [0, -10, 0] : 
             hostAnimation === 'excited' ? [0, -20, -10, -20, 0] :
             hostAnimation === 'think' ? [0, -5, 0] : [0, -15, 0],
          rotate: hostAnimation === 'point' ? [0, -10, 0] : 0
        }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        <div className="relative">
          <div 
            className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-[#FF6B00] flex items-center justify-center text-5xl md:text-6xl"
            style={{
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF0055 100%)',
              boxShadow: '0 0 30px rgba(255, 107, 0, 0.6)'
            }}
          >
            🎭
          </div>
          {/* Speech bubble */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute -top-16 -right-4 bg-white text-black px-4 py-2 rounded-2xl rounded-bl-none text-sm font-bold shadow-lg whitespace-nowrap"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
          >
            Ready? 🚀
          </motion.div>
        </div>
      </motion.div>

      {/* Floating action prompt */}
      <AnimatePresence>
        {showQuizPrompt && !countdown && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-20 right-4 md:right-12 z-20 max-w-xs"
          >
            <div className="bg-gradient-to-r from-[#9D00FF] to-[#FF0055] p-1 rounded-2xl">
              <div className="bg-black/90 backdrop-blur-xl p-4 rounded-xl">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-6 h-6 text-[#00FF94] flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-white font-bold mb-1 text-sm" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                      Quick Start 💡
                    </h4>
                    <p className="text-gray-300 text-xs mb-3">
                      Click the play button to join or try the interactive question mark!
                    </p>
                    <button
                      onClick={() => setShowQuizPrompt(false)}
                      className="text-[#00FF94] text-xs font-bold"
                    >
                      Got it! ✓
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setCountdown(null);
              }
            }}
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              className="text-[12rem] sm:text-[16rem] md:text-[20rem] font-bold"
              style={{
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF0055 50%, #9D00FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: 'Fredoka, sans-serif',
                filter: 'drop-shadow(0 0 100px rgba(255, 107, 0, 0.8))'
              }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>
        {`
          @keyframes neonPulse {
            0%, 100% {
              text-shadow: 
                0 0 10px rgba(255, 107, 0, 0.8),
                0 0 20px rgba(255, 107, 0, 0.6),
                0 0 30px rgba(255, 0, 85, 0.5),
                0 0 40px rgba(157, 0, 255, 0.4);
            }
            50% {
              text-shadow: 
                0 0 20px rgba(255, 107, 0, 1),
                0 0 30px rgba(255, 107, 0, 0.8),
                0 0 40px rgba(255, 0, 85, 0.7),
                0 0 50px rgba(157, 0, 255, 0.6);
            }
          }

          .neon-title {
            animation: neonPulse 2s ease-in-out infinite;
          }

          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            33% { transform: translateY(-20px) rotate(5deg); }
            66% { transform: translateY(-10px) rotate(-5deg); }
          }

          .floating-card {
            animation: float 6s ease-in-out infinite;
          }

          @keyframes shimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }

          .shimmer {
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(255, 255, 255, 0.3) 50%,
              transparent 100%
            );
            background-size: 200% 100%;
            animation: shimmer 3s linear infinite;
          }

          @keyframes blink {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0; }
          }

          .live-dot {
            animation: blink 1.5s infinite;
          }

          @keyframes marqueeScroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }

          .marquee-content {
            animation: marqueeScroll 25s linear infinite;
          }

          @keyframes scanline {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
          }

          .tv-screen {
            position: relative;
            background: linear-gradient(135deg, rgba(20, 20, 40, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%);
            overflow: hidden;
          }

          .tv-screen::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
              to bottom,
              transparent 0%,
              rgba(255, 255, 255, 0.05) 50%,
              transparent 100%
            );
            animation: scanline 4s linear infinite;
            pointer-events: none;
            z-index: 1;
          }

          .tv-screen::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: repeating-linear-gradient(
              to bottom,
              transparent 0px,
              rgba(0, 0, 0, 0.1) 2px,
              transparent 4px
            );
            pointer-events: none;
            z-index: 1;
          }

          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }

          .pulse-animation {
            animation: pulse 2s ease-in-out infinite;
          }

          @keyframes glow {
            0%, 100% { 
              box-shadow: 0 0 20px rgba(255, 107, 0, 0.6),
                          0 0 40px rgba(255, 0, 85, 0.4);
            }
            50% { 
              box-shadow: 0 0 30px rgba(255, 107, 0, 0.9),
                          0 0 60px rgba(255, 0, 85, 0.6),
                          0 0 80px rgba(255, 107, 0, 0.4);
            }
          }

          .glow-animation {
            animation: glow 2s ease-in-out infinite;
          }
        `}
      </style>
      
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center w-full max-w-6xl"
          style={{
            transform: `translateX(${mousePosition.x / 4}px) translateY(${mousePosition.y / 4}px)`,
            transition: 'transform 0.3s ease-out'
          }}
        >
          {/* Live stats bar */}
          <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
            <motion.div 
              className="flex items-center gap-2 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-[#00FF94]/30"
              whileHover={{ scale: 1.05, borderColor: 'rgba(0, 255, 148, 0.6)' }}
            >
              <span className="live-dot w-2.5 h-2.5 bg-red-500 rounded-full flex-shrink-0"></span>
              <span className="text-red-500 font-bold text-sm" style={{ fontFamily: 'Fredoka, sans-serif' }}>LIVE</span>
            </motion.div>
            
            <motion.div 
              className="flex items-center gap-2 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-[#FF6B00]/30"
              whileHover={{ scale: 1.05, borderColor: 'rgba(255, 107, 0, 0.6)' }}
              animate={{ borderColor: ['rgba(255, 107, 0, 0.3)', 'rgba(255, 107, 0, 0.6)', 'rgba(255, 107, 0, 0.3)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Users className="w-4 h-4 text-[#FF6B00]" />
              <span className="text-white font-bold text-sm" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                {activePlayerCount.toLocaleString()} online
              </span>
            </motion.div>
          </div>
          
          {/* Main title with enhanced neon effect */}
          <h1 
            className="neon-title text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-bold mb-4 tracking-tight px-2"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
            data-testid="home-title"
          >
            <span className="bg-gradient-to-r from-[#FF6B00] via-[#FF0055] to-[#9D00FF] bg-clip-text text-transparent">
              Prashnify
            </span>
          </h1>

          <p 
            className="text-sm md:text-base text-gray-300 font-medium mb-8"
            data-testid="home-subtitle"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
          >
            The Ultimate Real-Time Quiz Battle Arena
          </p>
          
          {/* Interactive question mark - now clickable with effects */}
          <motion.div
            className="inline-block mb-8 cursor-pointer select-none"
            whileHover={{ scale: 1.1, rotate: 15 }}
            whileTap={{ scale: 0.9 }}
            animate={{ 
              rotate: [0, 5, 0, -5, 0],
              y: [0, -10, 0]
            }}
            transition={{ 
              rotate: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
              y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }
            }}
            onClick={(e) => {
              createExplosion(e, '#00FF94');
              playSound(659.25, 150, 'sine');
              setHostAnimation('excited');
            }}
            onMouseEnter={() => playSound(523.25, 50, 'sine')}
            style={{
              filter: 'drop-shadow(0 0 30px rgba(255, 107, 0, 0.8))'
            }}
          >
            <div
              className="text-7xl sm:text-8xl md:text-[10rem] lg:text-[12rem] font-bold leading-none"
              style={{
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF0055 50%, #9D00FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: 'Fredoka, sans-serif'
              }}
            >
              ?
            </div>
          </motion.div>
          
          {/* Enhanced buttons with particle effects */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center mb-8 sm:mb-12 w-full max-w-md sm:max-w-none mx-auto">
            {/* Join Quiz - Interactive play button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onHoverStart={() => {
                setIsHovering('join');
                playSound(440, 50, 'sine');
              }}
              onHoverEnd={() => setIsHovering(null)}
              onClick={(e) => {
                createExplosion(e, '#FF6B00');
                playSound(523.25, 200, 'square');
                startCountdown();
              }}
              className="glow-animation bg-gradient-to-r from-[#FF6B00] to-[#FF0055] text-white font-bold py-5 px-10 sm:px-12 rounded-full w-full sm:w-auto flex items-center justify-center gap-3 text-lg relative overflow-hidden group"
              style={{ 
                fontFamily: 'Fredoka, sans-serif',
                minHeight: '64px'
              }}
              data-testid="join-quiz-button"
            >
              <div className="shimmer absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Play className="w-6 h-6 fill-white relative z-10" />
              <span className="relative z-10">Join Quiz</span>
              {isHovering === 'join' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  className="absolute inset-0 bg-white rounded-full"
                  transition={{ duration: 0.5 }}
                />
              )}
            </motion.button>
            
            {/* Admin Panel - Backstage VIP pass */}
            <motion.button
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onHoverStart={() => {
                setIsHovering('admin');
                playSound(392, 50, 'sine');
              }}
              onHoverEnd={() => setIsHovering(null)}
              onClick={(e) => {
                createExplosion(e, '#9D00FF');
                playSound(659.25, 200, 'square');
                navigate('/admin');
              }}
              className="relative bg-gradient-to-r from-[#9D00FF] to-[#7000B8] text-white font-bold py-5 px-10 sm:px-12 rounded-2xl w-full sm:w-auto flex items-center justify-center gap-3 border-2 border-[#9D00FF] group overflow-hidden"
              style={{ 
                fontFamily: 'Fredoka, sans-serif',
                minHeight: '64px',
                boxShadow: '0 0 30px rgba(157, 0, 255, 0.5)'
              }}
              data-testid="admin-panel-button"
            >
              {/* Animated stripe pattern */}
              <div 
                className="absolute inset-0 opacity-20"
                style={{
                  background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
                  animation: 'shimmer 3s linear infinite'
                }}
              />
              <Zap className="w-5 h-5 relative z-10 flex-shrink-0" />
              <div className="relative z-10 text-left">
                <div className="text-xs opacity-75 uppercase tracking-wider leading-none">VIP Access</div>
                <div className="text-base sm:text-lg font-bold leading-tight">Admin Panel</div>
              </div>
            </motion.button>
          </div>

          {/* Animated ticker tape with live updates */}
          <div className="mb-8 sm:mb-12 overflow-hidden py-3 -mx-4 sm:-mx-6 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00FF94] to-transparent opacity-20"></div>
            <div className="marquee-content whitespace-nowrap flex text-[#00FF94] font-bold text-sm sm:text-base md:text-lg" style={{ fontFamily: 'Fredoka, sans-serif' }}>
              <span className="px-4 flex items-center gap-2">
                🔥 TRENDING NOW · {activePlayerCount.toLocaleString()} PLAYERS ONLINE · 🏆 WIN PRIZES · ⚡ INSTANT RESULTS · 🎯 JOIN THE BATTLE · 
              </span>
              <span className="px-4 flex items-center gap-2">
                🔥 TRENDING NOW · {activePlayerCount.toLocaleString()} PLAYERS ONLINE · 🏆 WIN PRIZES · ⚡ INSTANT RESULTS · 🎯 JOIN THE BATTLE · 
              </span>
            </div>
          </div>
          
          {/* Feature cards - Enhanced with interactive elements */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full"
          >
            {[
              { icon: Zap, title: 'Real-time Updates', desc: 'Live leaderboard as you play', color: '#00FF94', testId: 'feature-realtime' },
              { icon: Trophy, title: 'Multiplayer Arena', desc: 'Battle with 100+ players', color: '#FF6B00', testId: 'feature-multiplayer' },
              { icon: Target, title: 'Instant Join', desc: 'No signup, just pure fun', color: '#9D00FF', testId: 'feature-instant' }
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                className="tv-screen floating-card rounded-2xl sm:rounded-3xl p-6 sm:p-8 border-4 relative group cursor-pointer"
                style={{
                  transform: 'perspective(800px) rotateY(0deg)',
                  borderColor: feature.color,
                  boxShadow: `0 0 20px ${feature.color}40`,
                  animationDelay: `${idx * 0.3}s`
                }}
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: `0 0 40px ${feature.color}80`,
                  rotateY: idx === 0 ? -5 : idx === 2 ? 5 : 0
                }}
                onHoverStart={() => playSound(440 + idx * 100, 50, 'sine')}
                onClick={(e) => {
                  createExplosion(e, feature.color);
                  playSound(523.25 + idx * 100, 150, 'sine');
                }}
                data-testid={feature.testId}
              >
                <div className="relative z-10">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <feature.icon className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 mx-auto" style={{ color: feature.color }} />
                  </motion.div>
                  <h3 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-3 text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-gray-300 mb-3">{feature.desc}</p>
                  
                  {/* Mini stats badge */}
                  <motion.div 
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
                    style={{ 
                      backgroundColor: `${feature.color}20`,
                      color: feature.color,
                      border: `1px solid ${feature.color}40`
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1 + idx * 0.2 }}
                  >
                    <Star className="w-3 h-3" />
                    <span>Active Now</span>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Call to action banner */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="mt-12 bg-gradient-to-r from-[#FF6B00]/20 via-[#FF0055]/20 to-[#9D00FF]/20 backdrop-blur-xl border border-[#FF6B00]/30 rounded-3xl p-6 sm:p-8"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left flex-1">
                <h3 className="text-2xl sm:text-3xl font-bold mb-2 text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  Ready to compete? 🚀
                </h3>
                <p className="text-gray-300 text-sm sm:text-base">
                  Join thousands of players in the most exciting quiz experience ever!
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => startCountdown()}
                className="pulse-animation bg-white text-black font-bold px-8 py-4 rounded-full flex items-center gap-2 shadow-2xl"
                style={{ fontFamily: 'Fredoka, sans-serif' }}
              >
                <Flame className="w-5 h-5" />
                <span>Start Now</span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Home;