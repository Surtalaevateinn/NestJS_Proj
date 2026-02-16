'use client';

import { useEffect, useState } from 'react';

interface User {
    id: number;
    username: string;
    isActive: boolean;
}

export default function Dashboard() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/users')
            .then((res) => res.json())
            .then((data) => {
                setUsers(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('System Link Failure:', err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
            {/* Navigation Header */}
            <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-sm font-light tracking-widest uppercase text-slate-400">
            System Architecture <span className="text-cyan-500">v1.0</span>
          </span>
                    <div className="flex gap-4">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-tighter text-slate-500">Node Online</span>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-12">
                <header className="mb-16">
                    <h1 className="text-4xl font-extralight tracking-tight text-white mb-2">
                        Entity Management
                    </h1>
                    <p className="text-slate-500 font-light text-sm">
                        Real-time synchronization with PostgreSQL via TypeORM Layer.
                    </p>
                </header>

                {/* User Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full py-20 text-center border border-dashed border-slate-800 rounded-xl">
              <span className="text-slate-600 animate-pulse font-light uppercase tracking-widest text-xs">
                Synchronizing Data...
              </span>
                        </div>
                    ) : (
                        users.map((user) => (
                            <div
                                key={user.id}
                                className="group relative bg-slate-900/40 border border-slate-800 p-6 rounded-xl hover:border-cyan-500/50 transition-all duration-500 shadow-2xl"
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <div className="h-10 w-10 bg-slate-800 rounded-lg flex items-center justify-center text-cyan-400 font-mono text-xs">
                                        0{user.id}
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-widest ${
                                        user.isActive ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'
                                    }`}>
                    {user.isActive ? 'Active' : 'Standby'}
                  </span>
                                </div>

                                <h3 className="text-xl font-light text-slate-100 group-hover:text-cyan-400 transition-colors">
                                    {user.username}
                                </h3>
                                <p className="text-slate-600 text-[10px] uppercase tracking-widest mt-1">
                                    Database Record Entry
                                </p>

                                {/* Subtle Hover Decor */}
                                <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-cyan-500 group-hover:w-full transition-all duration-700" />
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Footer Branding */}
            <footer className="fixed bottom-8 left-6">
                <p className="text-[10px] text-slate-700 font-mono rotate-90 origin-left tracking-[0.3em] uppercase">
                    Autonomous Entity Control
                </p>
            </footer>
        </div>
    );
}