'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (data.access_token) {
                setToken(data.access_token);
                // Store the user's initial perspective
                localStorage.setItem('user_view', JSON.stringify(data.user.lastView));
                router.push('/');
            } else {
                alert('Authentication Failed');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden">
            {/* Background Animation Layers */}
            <div className="absolute inset-0 z-0">
                {/* Modern Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

                {/* Floating Animated Orbs */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/20 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] animate-pulse [animation-delay:2s]"></div>
            </div>

            {/* Login Glass Card */}
            <form
                onSubmit={handleLogin}
                className="relative z-10 bg-slate-900/80 backdrop-blur-xl p-10 rounded-2xl border border-slate-800 w-[400px] shadow-2xl transition-all duration-500 hover:border-slate-700"
            >
                <div className="mb-10 text-center">
                    <div className="inline-block p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4">
                        <svg className="w-8 h-8 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-white text-3xl font-extralight tracking-widest uppercase">
                        Symbiose <span className="text-cyan-500 font-bold">OS</span>
                    </h2>
                    <p className="text-slate-500 text-[10px] mt-2 tracking-[0.3em] uppercase">Forest Management Terminal</p>
                </div>

                <div className="space-y-5">
                    <div className="group">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-4 text-slate-300 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-700"
                            placeholder="OPERATOR EMAIL"
                            required
                        />
                    </div>
                    <div className="group">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-4 text-slate-300 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-700"
                            placeholder="ACCESS KEY"
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full mt-8 overflow-hidden rounded-lg bg-cyan-600 p-4 transition-all hover:bg-cyan-500 active:scale-[0.98] disabled:opacity-50"
                >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <span className="text-white text-xs font-bold uppercase tracking-[0.2em]">Initialize Access</span>
                                <svg className="w-4 h-4 text-white transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                            </>
                        )}
                    </div>
                </button>

                <div className="mt-6 text-center">
                    <Link href="/register" className="text-[10px] text-slate-500 hover:text-cyan-500 transition-colors uppercase tracking-widest">
                        Request New Access Identifier
                    </Link>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-800/50 flex justify-between items-center text-[9px] text-slate-600 tracking-tighter uppercase font-mono">
                    <span>System Status: Optimal</span>
                    <span>Node: IDF-75-92</span>
                </div>
            </form>

            {/* Subtle Noise Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        </div>
    );
}