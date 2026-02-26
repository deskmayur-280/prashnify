// Centralized API configuration
// Set REACT_APP_BACKEND_URL in your environment (e.g., Vercel dashboard)
// to point to your production backend (e.g., https://your-backend.up.railway.app)

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// Auto-detect WebSocket protocol from backend URL
// https:// → wss://, http:// → ws://
const WS_BASE_URL = process.env.REACT_APP_WS_URL
  || BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const API_BASE_URL = BACKEND_URL;

export { API_BASE_URL, WS_BASE_URL, BACKEND_URL };
