'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('http://localhost:3000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (data.access_token) {
            setToken(data.access_token);
            // Store the user's initial perspective [cite: 24, 25]
            localStorage.setItem('user_view', JSON.stringify(data.user.lastView));
            router.push('/'); // Jump to homepage map
        } else {
            alert('Login Failed');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-xl border border-slate-800 w-96">
                <h2 className="text-white text-2xl font-light mb-6 tracking-tight">Forest System Access</h2>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-3 mb-4 text-slate-300 focus:outline-none focus:border-cyan-500"
                    placeholder="Email"
                />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-3 mb-6 text-slate-300 focus:outline-none focus:border-cyan-500"
                    placeholder="Password"
                />
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white p-3 rounded transition-colors uppercase tracking-widest text-xs">
                    Authorize
                </button>
            </form>
        </div>
    );
}