'use client';

import React, { useState } from 'react';
import { X, Sparkles, Mail, Lock, User } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  reason?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, reason, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطایی رخ داد.');
      } else {
        setName('');
        setEmail('');
        setPassword('');
        onSuccess();
      }
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border-2 border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="بستن"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200 mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800">
            {mode === 'register' ? 'ساخت حساب رایگان' : 'خوش برگشتی!'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {reason ||
              'برای ذخیره دائمی پیشرفت، کلمات ستاره‌دار و ساخت دسته با هوش مصنوعی وارد شو'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              mode === 'register'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ثبت‌نام
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              mode === 'login'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ورود
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              <input
                type="text"
                placeholder="نام شما (مثلاً سارا)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pr-10 pl-4 text-sm font-medium focus:border-emerald-400 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="email"
              dir="ltr"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pr-10 pl-4 text-sm font-medium text-left focus:border-emerald-400 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="password"
              dir="ltr"
              placeholder="رمز عبور (حداقل ۶ کاراکتر)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pr-10 pl-4 text-sm font-medium text-left focus:border-emerald-400 focus:bg-white focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-bold text-rose-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 py-3.5 text-base font-extrabold text-white hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading
              ? 'لطفاً صبر کنید...'
              : mode === 'register'
                ? 'شروع یادگیری رایگان 🚀'
                : 'ورود به حساب'}
          </button>
        </form>
      </div>
    </div>
  );
}
