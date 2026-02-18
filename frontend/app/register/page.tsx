'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setToken } from '@/lib/auth';

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        // 前端基础验证：检查密码一致性
        if (formData.password !== formData.confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3000/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    firstName: formData.firstName,
                    lastName: formData.lastName
                }),
            });

            const data = await res.json();

            if (res.ok && data.access_token) {
                // 注册成功后直接存储 Token 并进入系统
                setToken(data.access_token);
                localStorage.setItem('user_view', JSON.stringify(data.user.lastView));
                router.push('/');
            } else {
                alert(data.message || 'Registration failed. Email might already exist.');
            }
        } catch (err) {
            console.error('Registration error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden p-4">
            {/* Background Animation Layers (Identical to Login) */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-900/20 rounded-full blur-[120px] animate-pulse"></div>
            </div>

            {/* Registration Card */}
            <form
                onSubmit={handleRegister}
                className="relative z-10 bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 w-full max-w-[450px] shadow-2xl"
            >
                <div className="mb-8 text-center">
                    <h2 className="text-white text-2xl font-extralight tracking-widest uppercase">
                        Operator <span className="text-cyan-500 font-bold">Registration</span>
                    </h2>
                    <p className="text-slate-500 text-[9px] mt-2 tracking-[0.2em] uppercase">Create new administrative credentials</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="FIRST NAME"
                        className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all text-xs"
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                        required
                    />
                    <input
                        type="text"
                        placeholder="LAST NAME"
                        className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all text-xs"
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                        required
                    />
                </div>

                <div className="space-y-4">
                    <input
                        type="email"
                        placeholder="EMAIL ADDRESS"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all text-xs"
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        required
                    />
                    <input
                        type="password"
                        placeholder="PASSWORD (MIN 6 CHARS)"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all text-xs"
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        minLength={6}
                        required
                    />
                    <input
                        type="password"
                        placeholder="CONFIRM ACCESS KEY"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all text-xs"
                        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-8 overflow-hidden rounded-lg bg-cyan-600 p-3 transition-all hover:bg-cyan-500 active:scale-[0.98] disabled:opacity-50"
                >
                    <span className="text-white text-xs font-bold uppercase tracking-[0.2em]">
                        {isLoading ? 'Processing...' : 'Deploy Credentials'}
                    </span>
                </button>

                <div className="mt-6 text-center">
                    <Link href="/login" className="text-[10px] text-slate-500 hover:text-cyan-500 transition-colors uppercase tracking-widest">
                        Already have access? Return to terminal
                    </Link>
                </div>
            </form>

            {/* Subtle Noise Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        </div>
    );
}