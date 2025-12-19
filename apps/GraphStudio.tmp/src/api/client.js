import axios from 'axios';

/**
 * API client for GraphStudio authentication backend
 * This connects to the GraphStudio backend (runtime/graphstudio-backend)
 * for user authentication and subscription management.
 *
 * For panel operations, use the Python workspace-kernel backend (port 8000)
 * via NXMLRenderer component.
 */
const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
});

client.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default client;
