import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }
            const response = await client.get('/auth/me');
            setUser(response.data);
        } catch (error) {
            console.error("Failed to fetch user", error);
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUser();
    }, []);

    const login = async (email, password) => {
        try {
            console.log('[AuthContext] Login request:', { email, password: '***' });
            // OAuth2 expects form data with 'username' field (not 'email')
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const response = await client.post('/auth/token', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            console.log('[AuthContext] Login success:', { access_token: '***', token_type: response.data.token_type });
            localStorage.setItem('token', response.data.access_token);
            await fetchUser();
        } catch (error) {
            console.error('[AuthContext] Login error:', error.response?.data || error.message);
            throw error;
        }
    };

    const signup = async (email, password, fullName) => {
        try {
            console.log('[AuthContext] Signup request:', { email, password: '***', full_name: fullName });
            const response = await client.post('/auth/signup', { email, password, full_name: fullName });
            console.log('[AuthContext] Signup success:', response.data);
            await login(email, password);
        } catch (error) {
            console.error('[AuthContext] Signup error:', error.response?.data || error.message);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
