import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [timeOffset, setTimeOffset] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(0);

  // Persistent refs across re-renders
  const codeRef = useRef(null);
  const participantIdRef = useRef(null);
  const isAdminRef = useRef(false);
  const participantNameRef = useRef('');
  const avatarSeedRef = useRef('');
  const socketRef = useRef(null);           // raw socket ref (always up-to-date)
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false); // true when we close on purpose

  // Listeners registry  { type -> Set<callback> }
  const listeners = useRef(new Map());

  const addListener = useCallback((type, callback) => {
    if (!listeners.current.has(type)) {
      listeners.current.set(type, new Set());
    }
    listeners.current.get(type).add(callback);
    return () => {
      const typeListeners = listeners.current.get(type);
      if (typeListeners) typeListeners.delete(callback);
    };
  }, []);

  const _dispatch = useCallback((data) => {
    if (data.type && listeners.current.has(data.type)) {
      listeners.current.get(data.type).forEach(cb => cb(data));
    }
    if (listeners.current.has('*')) {
      listeners.current.get('*').forEach(cb => cb(data));
    }
  }, []);

  // Internal connect — no dependency on `socket` state to avoid stale closures
  const _doConnect = useCallback((code, participantId, isAdmin, participantName = '', avatarSeed = '') => {
    // Abort if already connecting / connected to same room
    if (socketRef.current &&
        socketRef.current.readyState <= WebSocket.OPEN &&
        codeRef.current === code) {
      return;
    }

    // Store identity for reconnects
    codeRef.current = code;
    participantIdRef.current = participantId;
    isAdminRef.current = isAdmin;
    participantNameRef.current = participantName;
    avatarSeedRef.current = avatarSeed;

    // Close existing socket cleanly
    if (socketRef.current) {
      intentionalCloseRef.current = true;
      socketRef.current.close(1000, 'Reconnecting');
    }

    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/ws/${code}`);
    socketRef.current = ws;
    intentionalCloseRef.current = false;

    ws.onopen = () => {
      console.log(`✅ WebSocket connected to quiz ${code}`);
      setIsConnected(true);
      setSocket(ws);
      reconnectCountRef.current = 0;

      // Dispatch connection status for UI banners
      _dispatch({ type: 'connection_status', connected: true, latency: 0 });

      // Time sync
      ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));

      // Announce identity
      if (isAdmin) {
        ws.send(JSON.stringify({ type: 'admin_joined', code }));
      } else if (participantId) {
        ws.send(JSON.stringify({
          type: 'participant_joined',
          participantId,
          name: participantName,
          avatarSeed,
          code
        }));
      }

      // Request state sync after reconnect (identity messages above also trigger sync,
      // but an explicit request ensures we get the latest state in all scenarios)
      if (reconnectCountRef.current === 0) {
        // Small delay to let identity messages process first
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'request_state_sync' }));
          }
        }, 300);
      }
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      // Handle batched messages from broadcast worker
      if (data.type === 'batch' && Array.isArray(data.messages)) {
        data.messages.forEach(msg => _dispatch(msg));
        return;
      }

      // Time sync (pong back from server)
      if (data.type === 'pong' && data.clientTime && data.serverTime) {
        const now = Date.now();
        const rtt = now - data.clientTime;
        setLatency(rtt);
        const latencyHalf = rtt / 2;
        const serverTimeAtReceipt = data.serverTime + latencyHalf;
        setTimeOffset(serverTimeAtReceipt - now);
        return;
      }

      // Server heartbeat ping — respond with pong
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
        return;
      }

      _dispatch(data);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onclose = (ev) => {
      console.log(`WebSocket closed (code=${ev.code})`);
      setIsConnected(false);
      setSocket(null);
      socketRef.current = null;

      // Dispatch disconnected status for UI banners
      _dispatch({ type: 'connection_status', connected: false });

      // Don't reconnect if we closed intentionally or no room stored
      if (intentionalCloseRef.current || !codeRef.current) return;
      // Max 15 reconnect attempts
      if (reconnectCountRef.current >= 15) {
        console.error('Max reconnect attempts reached');
        return;
      }

      const delay = Math.min(1000 * Math.pow(1.5, reconnectCountRef.current), 30000);
      reconnectCountRef.current += 1;
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);

      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        _doConnect(
          codeRef.current,
          participantIdRef.current,
          isAdminRef.current,
          participantNameRef.current,
          avatarSeedRef.current
        );
      }, delay);
    };
  }, [_dispatch]);

  // Visibility API — request state sync when tab comes back from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('📱 Tab visible again — requesting state sync');
        socketRef.current.send(JSON.stringify({ type: 'request_state_sync' }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const connect = useCallback((code, participantId, isAdmin, participantName = '', avatarSeed = '') => {
    _doConnect(code, participantId, isAdmin, participantName, avatarSeed);
  }, [_doConnect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    codeRef.current = null;
    participantIdRef.current = null;
    isAdminRef.current = false;
    if (socketRef.current) {
      socketRef.current.close(1000, 'User disconnected');
      socketRef.current = null;
    }
    setSocket(null);
    setIsConnected(false);
  }, []);

  const send = useCallback((message) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not ready, message dropped:', message?.type);
    }
  }, []);

  // Server-synchronized time
  const getServerTime = useCallback(() => {
    return Date.now() + timeOffset;
  }, [timeOffset]);

  const value = {
    socket,
    isConnected,
    timeOffset,
    latency,
    connect,
    disconnect,
    send,
    addListener,
    getServerTime,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
