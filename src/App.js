import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import JoinQuiz from './pages/JoinQuiz';
import QuizLobby from './pages/Quizlobby';
import AdminControl from './pages/AdminControl';
import QuizPlay from './pages/QuizPlay';
import Leaderboard from './pages/Leaderboard';
import FinalPodium from './pages/FinalPodium';
import CreateQuiz from './pages/CreateQuiz';
import MyResults from './pages/MyResults';
import { Toaster } from 'sonner';
import './App.css';

import { SocketProvider } from './context/SocketContext';
import { initAudio } from './utils/sounds';

// Auth guard for admin routes — validates JWT against backend
const AdminRoute = ({ children }) => {
  const [authStatus, setAuthStatus] = React.useState('checking');

  React.useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setAuthStatus('unauthorized');
      return;
    }
    const API = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000') + '/api';
    fetch(`${API}/admin/verify-token`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) {
          setAuthStatus('authorized');
        } else {
          localStorage.removeItem('adminToken');
          localStorage.removeItem('adminUsername');
          localStorage.removeItem('isAdmin');
          setAuthStatus('unauthorized');
        }
      })
      .catch(() => {
        // Network error — trust local token as fallback
        setAuthStatus('authorized');
      });
  }, []);

  if (authStatus === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#0F0524' }}>
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (authStatus === 'unauthorized') {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
};

function App() {
  // Initialize Web Audio on first user gesture
  useEffect(() => {
    const handler = () => {
      initAudio();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  return (
    <SocketProvider>
      <div className="App">
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen" style={{ background: '#0F0524' }}>
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/create" element={<AdminRoute><CreateQuiz /></AdminRoute>} />
              <Route path="/admin/control/:code" element={<AdminRoute><AdminControl /></AdminRoute>} />
              <Route path="/join" element={<JoinQuiz />} />
              <Route path="/lobby/:code" element={<QuizLobby />} />
              <Route path="/quiz/:code" element={<QuizPlay />} />
              <Route path="/leaderboard/:code" element={<Leaderboard />} />
              <Route path="/podium/:code" element={<FinalPodium />} />
              <Route path="/results/:code/:participantId" element={<MyResults />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    </SocketProvider>
  );
}

export default App;