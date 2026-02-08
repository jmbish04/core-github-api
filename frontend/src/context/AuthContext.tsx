
import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';

interface AuthContextType {
    apiKey: string | null;
    isAuthenticated: boolean;
    login: (key: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const COOKIE_NAME = 'colby_api_key';
const COOKIE_EXPIRES_DAYS = 7;

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [apiKey, setApiKey] = useState<string | null>(null);

    useEffect(() => {
        // Check cookie on mount
        const storedKey = Cookies.get(COOKIE_NAME);
        if (storedKey) {
            setApiKey(storedKey);
        }
    }, []);

    const login = (key: string) => {
        Cookies.set(COOKIE_NAME, key, { expires: COOKIE_EXPIRES_DAYS, secure: true, sameSite: 'strict' });
        setApiKey(key);
    };

    const logout = () => {
        Cookies.remove(COOKIE_NAME);
        setApiKey(null);
    };

    return (
        <AuthContext.Provider value={{ apiKey, isAuthenticated: !!apiKey, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
