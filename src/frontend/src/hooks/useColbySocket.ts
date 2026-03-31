import { useEffect, useRef, useState, useCallback } from 'react';

interface UseColbySocketOptions {
    url: string;
    onMessage?: (data: any) => void;
    reconnectInterval?: number;
    autoConnect?: boolean;
}

interface ColbySocketState {
    isConnected: boolean;
    lastMessage: any | null;
    socket: WebSocket | null;
}

export function useColbySocket({
    url,
    onMessage,
    reconnectInterval = 3000,
    autoConnect = true
}: UseColbySocketOptions) {
    const [state, setState] = useState<ColbySocketState>({
        isConnected: false,
        lastMessage: null,
        socket: null,
    });

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isMounted = useRef(false);
    const connectRef = useRef<() => void>(() => {});

    const connect = useCallback(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) return;

        try {
            console.log(`[useColbySocket] Connecting to ${url}`);
            const ws = new WebSocket(url);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('[useColbySocket] Connected');
                setState(prev => ({ ...prev, isConnected: true, socket: ws }));
            };

            ws.onclose = () => {
                console.log('[useColbySocket] Disconnected');
                setState(prev => ({ ...prev, isConnected: false, socket: null }));
                socketRef.current = null;

                if (isMounted.current && reconnectInterval > 0) {
                    reconnectTimerRef.current = setTimeout(() => connectRef.current(), reconnectInterval);
                }
            };

            ws.onerror = (error) => {
                console.error('[useColbySocket] Error:', error);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setState(prev => ({ ...prev, lastMessage: data }));
                    onMessage?.(data);
                } catch {
                    // Start of non-JSON message or raw text
                    setState(prev => ({ ...prev, lastMessage: event.data }));
                    onMessage?.(event.data);
                }
            };

        } catch (err) {
            console.error('[useColbySocket] Connection failed:', err);
            if (isMounted.current && reconnectInterval > 0) {
                reconnectTimerRef.current = setTimeout(() => connectRef.current(), reconnectInterval);
            }
        }
    }, [url, reconnectInterval, onMessage]);

    // Keep connectRef in sync
    connectRef.current = connect;

    const sendMessage = useCallback((data: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            socketRef.current.send(payload);
        } else {
            console.warn('[useColbySocket] Cannot send, socket not open');
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        if (autoConnect) {
            connect();
        }
        return () => {
            isMounted.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            socketRef.current?.close();
        };
    }, [connect, autoConnect]);

    return {
        ...state,
        sendMessage,
        connect
    };
}
