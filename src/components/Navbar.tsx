'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Flame,
  Star,
  Sparkles,
  Home,
  User as UserIcon,
  LogOut,
  Globe,
  Settings,
} from 'lucide-react';
import { useApp } from './AppProvider';

export function Navbar() {
  const pathname = usePathname();
  const { user, showEnglish, setShowEnglish, starredIds, openAuthModal, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b-2 border-slate-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 border-b-4 border-green-700 flex items-center justify-center text-xl shadow-sm group-hover:scale-105 transition">
              🇩🇪
            </div>
            <div className="leading-tight">
              <div className="font-de font-extrabold text-lg tracking-tight text-slate-800 flex items-center gap-1.5">
                DeutschKart
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Wortschatz
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                گنجینه فلش‌کارت هوشمند آلمانی
              </p>
            </div>
          </Link>

          {/* Desktop Quick Nav */}
          <nav className="hidden md:flex items-center gap-2">
            <Link
              href="/"
              className={`px-3.5 py-2 rounded-2xl text-sm font-bold flex items-center gap-1.5 transition ${
                pathname === '/'
                  ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Home className="w-4 h-4" />
              دسته‌ها
            </Link>
            <Link
              href="/starred"
              className={`px-3.5 py-2 rounded-2xl text-sm font-bold flex items-center gap-1.5 transition ${
                pathname.startsWith('/starred')
                  ? 'bg-amber-50 text-amber-700 border-2 border-amber-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              ستاره‌دارها
              {starredIds.size > 0 && (
                <span className="bg-amber-400 text-white text-xs px-1.5 py-0.2 rounded-full font-extrabold">
                  {starredIds.size}
                </span>
              )}
            </Link>
            <Link
              href="/create"
              className={`px-3.5 py-2 rounded-2xl text-sm font-bold flex items-center gap-1.5 transition ${
                pathname.startsWith('/create')
                  ? 'bg-violet-50 text-violet-700 border-2 border-violet-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4 text-violet-500" />
              ساخت با AI
            </Link>
          </nav>

          {/* Right Utilities */}
          <div className="flex items-center gap-2">
            {/* Streak badge */}
            <div
              title="تعداد روزهای پیوسته مطالعه"
              className="flex items-center gap-1 rounded-2xl bg-amber-50 border-2 border-amber-200 px-2.5 py-1.5 text-amber-600 font-extrabold text-sm"
            >
              <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
              <span>{user?.streakCount ?? 0}</span>
            </div>

            {/* Settings / Account popover */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 transition"
              >
                {user ? (
                  <>
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline max-w-[90px] truncate">{user.name}</span>
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline">تنظیمات / ورود</span>
                  </>
                )}
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-64 rounded-3xl bg-white shadow-xl border-2 border-slate-100 p-4 z-50 space-y-3">
                    {/* English translation toggle */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sky-500 shrink-0" />
                        <div className="leading-tight">
                          <div className="text-xs font-extrabold text-slate-800">
                            نمایش ترجمه انگلیسی
                          </div>
                          <div className="text-[11px] text-slate-400">
                            کنار معنی فارسی روی کارت
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEnglish(!showEnglish)}
                        className={`w-11 h-6 rounded-full transition p-0.5 flex items-center ${
                          showEnglish ? 'bg-emerald-500 justify-start' : 'bg-slate-300 justify-end'
                        }`}
                        aria-label="تغییر نمایش ترجمه انگلیسی"
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-sm block" />
                      </button>
                    </div>

                    {user ? (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="px-2">
                          <div className="text-sm font-extrabold text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-400 font-de" dir="ltr">
                            {user.email}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            setMenuOpen(false);
                            await logout();
                          }}
                          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 py-2.5 text-xs font-extrabold transition"
                        >
                          <LogOut className="w-4 h-4" />
                          خروج از حساب
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openAuthModal();
                        }}
                        className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-2.5 text-sm font-extrabold flex items-center justify-center gap-2"
                      >
                        <UserIcon className="w-4 h-4" />
                        ورود / ثبت‌نام رایگان
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-slate-100 px-3 py-2 flex items-center justify-around">
        <Link
          href="/"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-[11px] font-extrabold ${
            pathname === '/' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" />
          دسته‌ها
        </Link>
        <Link
          href="/starred"
          className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-[11px] font-extrabold ${
            pathname.startsWith('/starred') ? 'text-amber-600 bg-amber-50' : 'text-slate-400'
          }`}
        >
          <Star className="w-5 h-5" />
          ستاره‌دار
          {starredIds.size > 0 && (
            <span className="absolute -top-0.5 right-1 bg-amber-400 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
              {starredIds.size}
            </span>
          )}
        </Link>
        <Link
          href="/create"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-[11px] font-extrabold ${
            pathname.startsWith('/create')
              ? 'text-violet-600 bg-violet-50'
              : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          ساخت با AI
        </Link>
        <button
          onClick={() => (user ? setMenuOpen(true) : openAuthModal())}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-[11px] font-extrabold text-slate-400"
        >
          <UserIcon className="w-5 h-5" />
          {user ? user.name.slice(0, 6) : 'ورود'}
        </button>
      </nav>
    </>
  );
}
