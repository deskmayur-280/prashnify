import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, PlayCircle, Users, MoreVertical, Search,
  Clock, BarChart3, Eye, Trash2, Zap, PauseCircle, HelpCircle, LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const authHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
  });

  const handleAuthError = (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUsername');
      localStorage.removeItem('isAdmin');
      toast.error('Session expired. Please login again.');
      navigate('/admin/login');
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('isAdmin');
    toast.success('Logged out successfully');
    navigate('/admin/login');
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const response = await axios.get(`${API}/admin/quizzes`, authHeader());
      setQuizzes(response.data);
      setLoading(false);
    } catch (error) {
      if (handleAuthError(error)) return;
      console.error('Fetch quizzes error:', error);
      toast.error('Failed to load quizzes');
      setLoading(false);
    }
  };

  const toggleQuizStatus = async (code, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await axios.patch(`${API}/admin/quiz/${code}/status?status=${newStatus}`, null, authHeader());
      toast.success(`Quiz ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchQuizzes();
    } catch (error) {
      if (handleAuthError(error)) return;
      console.error('Update status error:', error);
      toast.error('Failed to update quiz status');
    }
  };

  const handleDeleteClick = (quiz) => {
    setQuizToDelete(quiz);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!quizToDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/admin/quiz/${quizToDelete.code}`, authHeader());
      setQuizzes(prev => prev.filter(q => q.code !== quizToDelete.code));
      toast.success(`Quiz "${quizToDelete.title}" deleted successfully`);
      setDeleteDialogOpen(false);
      setQuizToDelete(null);
    } catch (error) {
      if (handleAuthError(error)) return;
      console.error('Delete quiz error:', error);
      toast.error('Failed to delete quiz');
    } finally {
      setDeleting(false);
    }
  };

  const handleStartQuiz = (code) => {
    localStorage.setItem('isAdmin', 'true');
    navigate(`/admin/control/${code}`);
  };

  const filteredQuizzes = quizzes.filter(quiz => {
    const matchesSearch = quiz.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         quiz.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || quiz.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: quizzes.length,
    active: quizzes.filter(q => q.status === 'active').length,
    inactive: quizzes.filter(q => q.status === 'inactive').length,
    totalParticipants: quizzes.reduce((sum, q) => sum + (q.participantCount || 0), 0)
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0F0524 0%, #1A0A3E 100%)' }}>

      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-purple-500/20 backdrop-blur-xl"
        style={{ background: 'rgba(15,5,36,0.9)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                Prashnify
              </h1>
              <p className="text-xs text-purple-400">Admin Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/admin/create')}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-purple-500/25">
              <Plus className="w-4 h-4 mr-2" />
              New Quiz
            </Button>
            <Button onClick={handleLogout}
              variant="ghost"
              className="text-gray-400 hover:text-white hover:bg-red-500/20">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Quizzes', value: stats.total, icon: BarChart3, color: '#7C3AED' },
            { label: 'Active', value: stats.active, icon: PlayCircle, color: '#10B981' },
            { label: 'Total Players', value: stats.totalParticipants, icon: Users, color: '#F59E0B' },
            { label: 'Inactive', value: stats.inactive, icon: PauseCircle, color: '#6B7280' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label}
              className="rounded-2xl border p-5 relative overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${color}30` }}>
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20"
                style={{ background: color, transform: 'translate(30%, -30%)' }} />
              <Icon className="w-5 h-5 mb-3" style={{ color }} />
              <div className="text-3xl font-black text-white mb-1">{value}</div>
              <div className="text-sm text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-purple-500/50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
          <div className="flex gap-2">
            {['all', 'active', 'inactive'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                  filterStatus === s
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
                style={filterStatus !== s ? { background: 'rgba(255,255,255,0.05)' } : {}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Quiz grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-purple-500/20"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-6xl mb-4">🎮</div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No quizzes found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery ? 'Try adjusting your search' : 'Start by creating your first quiz!'}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate('/admin/create')}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                <Plus className="w-4 h-4 mr-2" /> Create Quiz
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuizzes.map((quiz, i) => (
              <motion.div key={quiz.code}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border overflow-hidden group hover:border-purple-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>

                {/* Accent bar */}
                <div className="h-1 w-full" style={{
                  background: quiz.status === 'active'
                    ? 'linear-gradient(90deg, #7C3AED, #10B981)'
                    : 'rgba(255,255,255,0.1)'
                }} />

                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      quiz.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}>
                      {quiz.status === 'active' ? '● Active' : '○ Inactive'}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 text-gray-200">
                        <DropdownMenuItem onClick={() => navigate(`/leaderboard/${quiz.code}`)} className="hover:bg-white/10">
                          <Eye className="w-4 h-4 mr-2 text-blue-400" /> View Leaderboard
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleQuizStatus(quiz.code, quiz.status)} className="hover:bg-white/10">
                          {quiz.status === 'active'
                            ? <><PauseCircle className="w-4 h-4 mr-2 text-yellow-400" /> Deactivate</>
                            : <><PlayCircle className="w-4 h-4 mr-2 text-green-400" /> Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteClick(quiz)} className="text-red-400 hover:bg-red-500/10">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1 group-hover:text-purple-300 transition-colors"
                    style={{ fontFamily: 'Fredoka, sans-serif' }}>
                    {quiz.title}
                  </h3>
                  <div className="font-mono text-xs text-purple-400 mb-4">PIN: {quiz.code}</div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-5">
                    <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" />{quiz.questionsCount}Q</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{quiz.duration}m</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{quiz.participantCount || 0}</span>
                  </div>

                  <button
                    onClick={() => handleStartQuiz(quiz.code)}
                    disabled={quiz.status !== 'active'}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                    style={{
                      background: quiz.status === 'active'
                        ? 'linear-gradient(135deg, #7C3AED, #4F46E5)'
                        : 'rgba(255,255,255,0.05)',
                      boxShadow: quiz.status === 'active' ? '0 4px 15px rgba(124,58,237,0.4)' : 'none'
                    }}>
                    <PlayCircle className="w-4 h-4 inline mr-2" /> Launch Quiz
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Quiz</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete "<strong className="text-white">{quizToDelete?.title}</strong>"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete Quiz'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;