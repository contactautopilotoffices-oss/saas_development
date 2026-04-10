/**
 * MasterAdminChatbot
 * AI-powered natural language query interface for master admins.
 * @remarks Client component.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Terminal, HelpCircle, Shield, Zap, Search, ChevronRight, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
    role: 'user' | 'assistant' | 'error';
    content: string;
    sql?: string;
    timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
    "How many tickets were created today?",
    "Which property has the most open tickets?",
    "How many users are in the system?",
    "Status breakdown of all tickets",
    "How many critical tickets are currently open?"
];

export default function MasterAdminChatbot() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Systems online. I am your Autopilot Intelligence Engine. You can query any operational data, analytics, or system metrics using natural language. What insights do you require?',
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSql, setShowSql] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text: string = input) => {
        if (!text.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: text, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/master-admin-chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text })
            });

            const data = await response.json();

            if (!response.ok) {
                setMessages(prev => [...prev, {
                    role: 'error',
                    content: data.error || 'Something went wrong while fetching data.',
                    timestamp: new Date()
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer,
                    sql: data.sql,
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'error',
                content: 'Failed to connect to the AI service. Please check your connection.',
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-full bg-[#fcfdfe] relative font-inter transition-all duration-500">
            {/* Professional Header / Command Bar */}
            <div className="px-10 py-4 bg-slate-900 text-white flex items-center justify-between relative overflow-hidden shadow-lg shadow-slate-900/10">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -ml-20 -mb-20" />

                <div className="flex items-center gap-6 relative z-10">
                    <div className="relative">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                            <Bot className="w-8 h-8 text-white" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="font-black text-2xl tracking-tight">Intelligence Hub</h2>
                            <span className="px-3 py-1 bg-indigo-500/20 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-400/30 text-indigo-300 backdrop-blur-md animate-pulse">
                                Llama 3.3 70B
                            </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                Secure SQL Gateway Active
                            </p>
                            <div className="h-1 w-1 rounded-full bg-slate-700" />
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                                Sub-second Latency Target
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                <BarChart2 className="w-3.5 h-3.5" />
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-2.5 bg-white/5 hover:bg-white/10 transition-colors rounded-2xl border border-white/10 flex items-center gap-3 group cursor-pointer">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                        <span className="text-xs font-black uppercase tracking-widest text-white">System Synchronized</span>
                    </div>
                </div>
            </div>

            {/* Main Discussion Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50/20">
                <AnimatePresence>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`flex gap-6 w-full ${msg.role === 'user' ? 'max-w-[75%] flex-row-reverse' : 'max-w-[85%] flex-row'}`}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 shadow-sm transition-all ${msg.role === 'user' ? 'bg-slate-900 text-white' :
                                    msg.role === 'error' ? 'bg-rose-500 text-white' : 'bg-white border border-slate-200 text-indigo-600'
                                    }`}>
                                    {msg.role === 'user' ? <User className="w-6 h-6" /> :
                                        msg.role === 'error' ? <AlertCircle className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                                </div>
                                <div className="space-y-4 flex-1">
                                    <div className={`p-5 rounded-[20px] text-base font-semibold leading-relaxed shadow-sm border border-slate-200/50 transition-all ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-lg shadow-indigo-500/10'
                                        : msg.role === 'error'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-100 rounded-tl-none'
                                            : 'bg-white text-slate-800 rounded-tl-none ring-1 ring-slate-100/50 shadow-sm'
                                        }`}>
                                        {msg.content}
                                        <div className={`mt-3 text-[10px] font-bold uppercase tracking-wider ${msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>

                                    {msg.sql && (
                                        <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl">
                                            <div
                                                onClick={() => setShowSql(showSql === idx ? null : idx)}
                                                className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Terminal className="w-4 h-4 text-indigo-400" />
                                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Generated Query</span>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center transition-transform ${showSql === idx ? 'rotate-180' : ''}`}>
                                                    <ChevronRight className="w-3 h-3 text-slate-500 rotate-90" />
                                                </div>
                                            </div>
                                            <AnimatePresence>
                                                {showSql === idx && (
                                                    <motion.div
                                                        initial={{ height: 0 }}
                                                        animate={{ height: 'auto' }}
                                                        exit={{ height: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="p-6 pt-0">
                                                            <pre className="p-4 bg-slate-950 text-indigo-300 rounded-2xl text-[12px] font-mono leading-relaxed border border-slate-800/50 overflow-x-auto">
                                                                {msg.sql}
                                                            </pre>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div className="flex gap-6 w-full max-w-[85%]">
                                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shadow-sm">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <div className="bg-white border border-slate-200/60 rounded-[32px] rounded-tl-none p-6 shadow-sm flex items-center gap-5">
                                    <div className="flex gap-2">
                                        {[0, 1, 2].map((i) => (
                                            <motion.div
                                                key={i}
                                                animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                                                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                                                className="w-2 h-2 bg-indigo-500 rounded-full"
                                            />
                                        ))}
                                    </div>
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Executing Vector Analysis...</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Input & Suggestions Control Zone */}
            <div className="px-10 py-5 bg-white/90 backdrop-blur-2xl border-t border-slate-200/60 relative z-20 shadow-[0_-12px_40px_rgb(0,0,0,0.06)]">
                {/* Visual Accent */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-1 bg-slate-100 rounded-full" />

                <div className="max-w-6xl mx-auto space-y-5">
                    {/* Professional Suggestions Header */}
                    <div className="flex items-center gap-4 px-2">
                        <div className="h-px flex-1 bg-slate-100" />
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                            Operational Command Prompts
                        </p>
                        <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {SUGGESTED_QUESTIONS.map((q, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSend(q)}
                                disabled={isLoading}
                                className="px-5 py-3 bg-indigo-50/50 hover:bg-gradient-to-br hover:from-indigo-600 hover:to-purple-600 text-slate-700 hover:text-white rounded-[20px] text-xs font-bold border border-indigo-100/50 hover:border-transparent transition-all flex items-center gap-3 group disabled:opacity-50 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/30 active:scale-95"
                            >
                                <HelpCircle className="w-4 h-4 text-indigo-400 group-hover:text-white transition-colors" />
                                {q}
                            </button>
                        ))}
                    </div>

                    <div className="relative group max-w-5xl mx-auto">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-[32px] opacity-10 group-focus-within:opacity-25 transition-opacity blur-xl animate-gradient-xy" />
                        <div className="relative flex items-center bg-white/95 border border-slate-200 group-focus-within:border-indigo-400/50 rounded-[30px] p-1 pr-4 transition-all shadow-xl group-focus-within:shadow-indigo-500/10">
                            <div className="pl-6 text-slate-400">
                                <Search className="w-6 h-6" />
                            </div>
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Describe the operational insight you need..."
                                disabled={isLoading}
                                className="flex-1 bg-transparent border-none focus:ring-0 py-5 pl-4 px-6 text-base font-bold text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                                className="p-4 bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 text-white rounded-[22px] transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                            >
                                <span className="text-xs font-black uppercase tracking-widest pl-2 hidden sm:block">Analyze</span>
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-[9px] font-black text-slate-400 uppercase tracking-widest pt-2">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            LLM Enhanced
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Live Schema Sync
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            Audit Logged
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
