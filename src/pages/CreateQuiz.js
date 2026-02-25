import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { toast } from 'sonner';
import {
  Save, ArrowLeft, Settings, Sparkles, Plus, Trash2, Copy,
  Image as ImageIcon, Video, Music, GripVertical,
  Eye, EyeOff, Clock, Award, Target,
  Check, X, Share2, Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const QUESTION_TYPES = [
  { id: 'quiz', label: 'Quiz', icon: '🎯', color: '#E21B3C' },
  { id: 'trueFalse', label: 'True/False', icon: '✓✗', color: '#1368CE' },
  { id: 'typeAnswer', label: 'Type Answer', icon: '⌨️', color: '#FFA602' },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩', color: '#26890C' }
];

const ANSWER_COLORS = [
  { name: 'Red Triangle', color: '#E21B3C', shape: 'triangle' },
  { name: 'Blue Diamond', color: '#1368CE', shape: 'diamond' },
  { name: 'Yellow Circle', color: '#FFA602', shape: 'circle' },
  { name: 'Green Square', color: '#26890C', shape: 'square' }
];

const TIME_LIMITS = [
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 90, label: '90 seconds' },
  { value: 120, label: '2 minutes' }
];

const POINT_OPTIONS = [
  { value: 'standard', label: 'Standard (1000 pts)' },
  { value: 'double', label: 'Double points (2000 pts)' },
  { value: 'noPoints', label: 'No points' }
];

function CreateQuiz() {
  const navigate = useNavigate();

  const authHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
  });
  
  // Quiz metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState(null);
  
  // Questions
  const [questions, setQuestions] = useState([
    {
      id: '1',
      type: 'quiz',
      question: '',
      media: null,
      options: [
        { id: 'a1', text: '', correct: false },
        { id: 'a2', text: '', correct: false },
        { id: 'a3', text: '', correct: false },
        { id: 'a4', text: '', correct: false }
      ],
      timeLimit: 20,
      points: 'standard',
      answerMode: 'single'
    }
  ]);
  
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autosave, setAutosave] = useState(true);
  const [createdQuiz, setCreatedQuiz] = useState(null);

  const activeQuestion = questions[activeQuestionIndex];

  // Auto-save functionality
  useEffect(() => {
    if (!autosave) return;
    
    const timer = setTimeout(() => {
      localStorage.setItem('quiz_draft', JSON.stringify({
        title,
        description,
        questions,
        timestamp: new Date().toISOString()
      }));
    }, 2000);

    return () => clearTimeout(timer);
  }, [title, description, questions, autosave]);

  // Question handlers
  const addQuestion = useCallback(() => {
    const newQuestion = {
      id: Date.now().toString(),
      type: 'quiz',
      question: '',
      media: null,
      options: [
        { id: `${Date.now()}-a1`, text: '', correct: false },
        { id: `${Date.now()}-a2`, text: '', correct: false },
        { id: `${Date.now()}-a3`, text: '', correct: false },
        { id: `${Date.now()}-a4`, text: '', correct: false }
      ],
      timeLimit: 20,
      points: 'standard',
      answerMode: 'single'
    };
    
    setQuestions([...questions, newQuestion]);
    setActiveQuestionIndex(questions.length);
    toast.success('Question added');
  }, [questions]);

  const deleteQuestion = useCallback((index) => {
    if (questions.length === 1) {
      toast.error('Cannot delete the last question');
      return;
    }
    
    const newQuestions = questions.filter((_, i) => i !== index);
    setQuestions(newQuestions);
    setActiveQuestionIndex(Math.max(0, index - 1));
    toast.success('Question deleted');
  }, [questions]);

  const duplicateQuestion = useCallback((index) => {
    const questionToDuplicate = { ...questions[index] };
    questionToDuplicate.id = Date.now().toString();
    questionToDuplicate.options = questionToDuplicate.options.map((opt, i) => ({
      ...opt,
      id: `${Date.now()}-a${i + 1}`
    }));
    
    const newQuestions = [...questions];
    newQuestions.splice(index + 1, 0, questionToDuplicate);
    setQuestions(newQuestions);
    setActiveQuestionIndex(index + 1);
    toast.success('Question duplicated');
  }, [questions]);

  const updateQuestion = useCallback((index, updates) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  }, [questions]);

  const updateOption = useCallback((questionIndex, optionIndex, text) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].options[optionIndex].text = text;
    setQuestions(newQuestions);
  }, [questions]);

  const toggleCorrectAnswer = useCallback((questionIndex, optionIndex) => {
    const newQuestions = [...questions];
    const question = newQuestions[questionIndex];
    
    if (question.answerMode === 'single') {
      question.options.forEach((opt, i) => {
        opt.correct = i === optionIndex;
      });
    } else {
      question.options[optionIndex].correct = !question.options[optionIndex].correct;
    }
    
    setQuestions(newQuestions);
  }, [questions]);

  const handleMediaUpload = useCallback(async (file, questionIndex) => {
    toast.info('Media upload would happen here');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Please enter a quiz title');
      return;
    }
    
    const invalidQuestions = questions.filter(q => !q.question.trim());
    if (invalidQuestions.length > 0) {
      toast.error('Please fill in all questions');
      return;
    }

    // Validate every question has at least one correct answer
    for (let i = 0; i < questions.length; i++) {
      const hasCorrect = questions[i].options.some(opt => opt.correct);
      if (!hasCorrect) {
        setActiveQuestionIndex(i);
        toast.error(`Question ${i + 1} needs at least one correct answer`);
        return;
      }
    }

    setLoading(true);
    try {
      const quizData = {
        title,
        description,
        duration: Math.ceil(questions.reduce((sum, q) => sum + q.timeLimit, 0) / 60),
        questions: questions.map((q, index) => ({
          question: q.question,
          options: q.options.map(opt => opt.text),
          correctAnswer: q.answerMode === 'single' 
            ? q.options.findIndex(opt => opt.correct)
            : q.options.map((opt, i) => opt.correct ? i : -1).filter(i => i !== -1),
          timeLimit: q.timeLimit,
          points: q.points,
          type: q.type
        }))
      };

      const response = await axios.post(`${API}/admin/quiz`, quizData, authHeader());
      
      localStorage.removeItem('quiz_draft');
      setCreatedQuiz(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('adminToken');
        toast.error('Session expired. Please login again.');
        navigate('/admin/login');
        return;
      }
      console.error('Error creating quiz:', error);
      toast.error('Failed to create quiz');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin')}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <Separator orientation="vertical" className="h-8" />
            
            <div className="flex items-center gap-3">
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter quiz title..."
                className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 w-[300px]"
                style={{ fontFamily: 'Fredoka, sans-serif' }}
              />
              {autosave && (
                <Badge variant="secondary" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Saved
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Hide' : 'Preview'}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setAutosave(!autosave)}>
                  <Switch checked={autosave} className="mr-2" />
                  Auto-save
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Clock className="w-4 h-4 mr-2" />
                  Quiz settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="outline" onClick={() => navigate('/admin')}>
              Exit
            </Button>
            
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Question List */}
        <aside className="w-[280px] border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-gray-600">
                {questions.length} Question{questions.length !== 1 ? 's' : ''}
              </h3>
              <Button
                size="sm"
                onClick={addQuestion}
                className="h-8 gap-1 bg-[#FF6B00] hover:bg-[#E55F00]"
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>

            <Reorder.Group
              axis="y"
              values={questions}
              onReorder={setQuestions}
              className="space-y-2"
            >
              {questions.map((question, index) => (
                <Reorder.Item key={question.id} value={question}>
                  <motion.div
                    layout
                    className={`
                      group relative p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${activeQuestionIndex === index
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/5 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                      }
                    `}
                    onClick={() => setActiveQuestionIndex(index)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-600 shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate mb-1">
                          {question.question || 'Start typing your question'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {question.timeLimit}s
                          </Badge>
                          <span>•</span>
                          <span>{question.options.filter(o => o.correct).length} correct</span>
                        </div>
                      </div>

                      <GripVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </motion.div>
                </Reorder.Item>
              ))}
            </Reorder.Group>

            <Separator className="my-4" />

            <Button
              variant="outline"
              className="w-full gap-2 border-dashed"
              onClick={addQuestion}
            >
              <Plus className="w-4 h-4" />
              Add Question
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2 border-dashed text-purple-600 border-purple-300 hover:bg-purple-50"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
          </div>
        </aside>

        {/* Main Editor */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeQuestionIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Question Type Selector */}
                <Card className="border-2">
                  <CardContent className="p-6">
                    <Label className="text-sm font-semibold text-gray-700 mb-3 block">
                      Question type
                    </Label>
                    <div className="grid grid-cols-4 gap-3">
                      {QUESTION_TYPES.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => updateQuestion(activeQuestionIndex, { type: type.id })}
                          className={`
                            relative p-4 rounded-xl border-2 transition-all text-center
                            ${activeQuestion.type === type.id
                              ? 'border-current shadow-lg scale-105'
                              : 'border-gray-200 hover:border-gray-300'
                            }
                          `}
                          style={{
                            color: activeQuestion.type === type.id ? type.color : '#64748B'
                          }}
                        >
                          <div className="text-3xl mb-2">{type.icon}</div>
                          <div className="text-sm font-semibold">{type.label}</div>
                          {activeQuestion.type === type.id && (
                            <motion.div
                              layoutId="activeType"
                              className="absolute inset-0 rounded-xl border-2"
                              style={{ borderColor: type.color }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Question Editor */}
                <Card className="border-2 bg-gradient-to-br from-purple-50 to-blue-50">
                  <CardContent className="p-8">
                    <Textarea
                      value={activeQuestion.question}
                      onChange={(e) => updateQuestion(activeQuestionIndex, { question: e.target.value })}
                      placeholder="Start typing your question"
                      className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 resize-none bg-transparent min-h-[120px]"
                      style={{ fontFamily: 'Fredoka, sans-serif' }}
                    />

                    {/* Media Upload Zone */}
                    <div className="mt-6">
                      <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-8 bg-white/50 hover:bg-white/80 transition-colors group cursor-pointer">
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={(e) => handleMediaUpload(e.target.files[0], activeQuestionIndex)}
                        />
                        
                        <div className="text-center">
                          <div className="flex justify-center gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                            <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
                              <Video className="w-6 h-6" />
                            </div>
                            <div className="p-3 rounded-lg bg-pink-100 text-pink-600">
                              <Music className="w-6 h-6" />
                            </div>
                          </div>
                          
                          <p className="text-sm font-semibold text-gray-700 mb-1">
                            Find and insert media
                          </p>
                          <p className="text-xs text-gray-500">
                            or drag and drop
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Answer Options */}
                <div className="grid grid-cols-2 gap-4">
                  {activeQuestion.options.map((option, optIndex) => {
                    const answerColor = ANSWER_COLORS[optIndex];
                    const isCorrect = option.correct;
                    
                    return (
                      <Card
                        key={option.id}
                        className={`
                          border-2 transition-all cursor-pointer group
                          ${isCorrect
                            ? 'ring-4 ring-green-400/50 border-green-500 shadow-lg scale-[1.02]'
                            : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                        onClick={() => toggleCorrectAnswer(activeQuestionIndex, optIndex)}
                      >
                        <CardContent className="p-0">
                          <div className="flex items-stretch">
                            {/* Color indicator */}
                            <div
                              className="w-16 flex items-center justify-center shrink-0"
                              style={{ backgroundColor: answerColor.color }}
                            >
                              <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center">
                                {answerColor.shape === 'triangle' && (
                                  <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[20px] border-b-white" />
                                )}
                                {answerColor.shape === 'diamond' && (
                                  <div className="w-6 h-6 bg-white transform rotate-45" />
                                )}
                                {answerColor.shape === 'circle' && (
                                  <div className="w-6 h-6 bg-white rounded-full" />
                                )}
                                {answerColor.shape === 'square' && (
                                  <div className="w-6 h-6 bg-white" />
                                )}
                              </div>
                            </div>

                            {/* Answer input */}
                            <div className="flex-1 p-4 relative">
                              <Input
                                value={option.text}
                                onChange={(e) => updateOption(activeQuestionIndex, optIndex, e.target.value)}
                                placeholder={`Add answer ${optIndex + 1}${optIndex > 1 ? ' (optional)' : ''}`}
                                className="border-none shadow-none focus-visible:ring-0 text-base font-semibold"
                                onClick={(e) => e.stopPropagation()}
                              />
                              
                              {isCorrect && (
                                <div className="absolute top-2 right-2">
                                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Media upload for answer */}
                            <button
                              className="w-12 flex items-center justify-center border-l border-gray-200 hover:bg-gray-50 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <ImageIcon className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Add more answers button */}
                {activeQuestion.options.length < 6 && (
                  <Button
                    variant="outline"
                    className="w-full border-dashed gap-2"
                    onClick={() => {
                      const newOption = {
                        id: `${Date.now()}-a${activeQuestion.options.length + 1}`,
                        text: '',
                        correct: false
                      };
                      updateQuestion(activeQuestionIndex, {
                        options: [...activeQuestion.options, newOption]
                      });
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Add more answers
                  </Button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Right Sidebar - Settings */}
        <aside className="w-[320px] border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Time limit</h3>
              </div>
              
              <Select
                value={activeQuestion.timeLimit.toString()}
                onValueChange={(value) => updateQuestion(activeQuestionIndex, { timeLimit: parseInt(value) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_LIMITS.map((time) => (
                    <SelectItem key={time.value} value={time.value.toString()}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="link"
                className="mt-2 text-xs text-purple-600 p-0 h-auto"
                onClick={() => {
                  questions.forEach((_, index) => {
                    updateQuestion(index, { timeLimit: activeQuestion.timeLimit });
                  });
                  toast.success('Time limit applied to all questions');
                }}
              >
                Apply to all questions
              </Button>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Points</h3>
              </div>
              
              <Select
                value={activeQuestion.points}
                onValueChange={(value) => updateQuestion(activeQuestionIndex, { points: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POINT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Answer options</h3>
              </div>
              
              <Select
                value={activeQuestion.answerMode}
                onValueChange={(value) => {
                  const newOptions = activeQuestion.options.map(opt => ({ ...opt, correct: false }));
                  updateQuestion(activeQuestionIndex, { answerMode: value, options: newOptions });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single select</SelectItem>
                  <SelectItem value="multi">Multi select</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => duplicateQuestion(activeQuestionIndex)}
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => deleteQuestion(activeQuestionIndex)}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>

            <Separator />

            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">AI Assistant</h4>
                  <p className="text-xs text-gray-600">Generate questions automatically</p>
                </div>
              </div>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" size="sm">
                Try AI Generator
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                    Quiz Preview
                  </h2>
                  <Button variant="ghost" onClick={() => setShowPreview(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl p-8 text-white">
                    <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                      {title || 'Untitled Quiz'}
                    </h1>
                    <p className="text-white/80">{description}</p>
                    <div className="flex gap-4 mt-4">
                      <Badge className="bg-white/20 text-white">
                        {questions.length} questions
                      </Badge>
                      <Badge className="bg-white/20 text-white">
                        {Math.ceil(questions.reduce((sum, q) => sum + q.timeLimit, 0) / 60)} minutes
                      </Badge>
                    </div>
                  </div>

                  {questions.map((question, index) => (
                    <Card key={question.id}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Question {index + 1}: {question.question || 'No question text'}
                        </CardTitle>
                        <CardDescription>
                          {question.timeLimit}s • {question.points} points
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          {question.options.map((option, optIndex) => (
                            <div
                              key={option.id}
                              className={`
                                p-3 rounded-lg border-2
                                ${option.correct
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-gray-200'
                                }
                              `}
                            >
                              <div className="flex items-center gap-2">
                                {option.correct && (
                                  <Check className="w-4 h-4 text-green-600" />
                                )}
                                <span className="text-sm font-medium">
                                  {option.text || `Option ${optIndex + 1}`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Success Screen */}
      <AnimatePresence>
        {createdQuiz && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="bg-white rounded-3xl p-8 md:p-12 max-w-lg w-full text-center shadow-2xl"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
              </motion.div>
              
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-2" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                Quiz Created! 🎉
              </h2>
              <p className="text-gray-500 mb-8">Share this PIN with your players</p>
              
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="bg-purple-50 rounded-2xl p-6 mb-6 cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(createdQuiz.code);
                  toast.success('📋 Game PIN copied!');
                }}
              >
                <p className="text-sm text-purple-600 font-semibold mb-2">GAME PIN</p>
                <p className="text-5xl md:text-6xl font-black text-purple-900 tracking-wider select-all" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                  {createdQuiz.code}
                </p>
                <p className="text-xs text-purple-400 mt-2">Click to copy</p>
              </motion.div>
              
              <div className="flex items-center justify-center mb-6">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}/join?code=${createdQuiz.code}`}
                  alt="QR Code"
                  className="w-32 h-32 rounded-xl shadow-lg"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: createdQuiz.title,
                        text: `Join my quiz! Game PIN: ${createdQuiz.code}`,
                        url: `${window.location.origin}/join?code=${createdQuiz.code}`
                      }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(`${window.location.origin}/join?code=${createdQuiz.code}`);
                      toast.success('Join link copied!');
                    }
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full px-6 py-3 gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Share Quiz
                </Button>
                
                <Button
                  onClick={() => navigate(`/lobby/${createdQuiz.code}`)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full px-6 py-3 gap-2"
                >
                  Go to Lobby
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin')}
                  className="rounded-full px-6 py-3"
                >
                  Dashboard
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CreateQuiz;