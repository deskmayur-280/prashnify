import { useNavigate } from 'react-router-dom';
import { Play, Trophy, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div 
      className="quiz-theme relative overflow-hidden"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1767474256408-3db5bcc42eb9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMHBsYXlmdWwlMjBnZW9tZXRyaWMlMjAzZCUyMHNoYXBlcyUyMHZpYnJhbnQlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3MDIyNTIxM3ww&ixlib=rb-4.1.0&q=85)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/70" />
      
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl"
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="inline-block mb-6"
          >
            <Trophy className="w-24 h-24 text-[#00FF94]" data-testid="home-trophy-icon" />
          </motion.div>
          
          <h1 
            className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
            data-testid="home-title"
          >
            <span className="bg-gradient-to-r from-[#FF6B00] via-[#FF0055] to-[#9D00FF] bg-clip-text text-transparent">
              Prashnify
            </span>
          </h1>
          
          <p 
            className="text-xl md:text-2xl text-gray-300 mb-12 font-medium"
            data-testid="home-subtitle"
          >
            Real-time multiplayer quizzes with live leaderboards
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/join')}
              className="bg-[#FF6B00] text-white font-bold py-5 px-10 rounded-full border-b-4 border-[#CC4800] hover:brightness-110 transition-all text-lg flex items-center gap-3"
              style={{ fontFamily: 'Fredoka, sans-serif' }}
              data-testid="join-quiz-button"
            >
              <Play className="w-6 h-6" />
              Join Quiz
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/admin')}
              className="bg-[#9D00FF] text-white font-bold py-5 px-10 rounded-full border-b-4 border-[#7000B8] hover:brightness-110 transition-all text-lg flex items-center gap-3"
              style={{ fontFamily: 'Fredoka, sans-serif' }}
              data-testid="admin-panel-button"
            >
              <Zap className="w-6 h-6" />
              Admin Panel
            </motion.button>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left"
          >
            <div className="glass-card rounded-2xl p-6" data-testid="feature-realtime">
              <Zap className="w-8 h-8 text-[#00FF94] mb-3" />
              <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Fredoka, sans-serif' }}>Real-time Updates</h3>
              <p className="text-gray-400 text-sm">Live leaderboard updates as players answer</p>
            </div>
            
            <div className="glass-card rounded-2xl p-6" data-testid="feature-multiplayer">
              <Trophy className="w-8 h-8 text-[#FF6B00] mb-3" />
              <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Fredoka, sans-serif' }}>Multiplayer</h3>
              <p className="text-gray-400 text-sm">Compete with 100+ players simultaneously</p>
            </div>
            
            <div className="glass-card rounded-2xl p-6" data-testid="feature-instant">
              <Play className="w-8 h-8 text-[#9D00FF] mb-3" />
              <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Fredoka, sans-serif' }}>Instant Join</h3>
              <p className="text-gray-400 text-sm">No signup required - just enter and play</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Home;