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
  BookOpenCheck,
  Map,
  Zap,
  Snowflake,
} from 'lucide-react';
import { useApp } from './AppProvider';

const DAILY_GOAL_OPTIONS = [
  { xp: 30, label: 'آرام (۳۰ XP)' },
  { xp: 50, label: 'عادی (۵۰ XP)' },
  { xp: 100, label: 'جدی (۱۰۰ XP)' },
];

export function Navbar() {
  const pathname = usePathname();
  const {
    user,
    showEnglish,
    setShowEnglish,
    setDailyGoal,
    starredIds,
    openAuthModal,
    logout,
  } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const dailyXp = user?.dailyXp ?? 0;
  const dailyGoal = user?.dailyGoal ?? 50;
  const goalDone = user && dailyXp >= dailyGoal;

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b-2 border-slate-100">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 border-b-4 border-green-700 flex items-center justify-center text-lg sm:text-xl shadow-sm group-hover:scale-105 transition">
              🇩🇪
            </div>
            <div className="leading-tight">
              <div className="font-de font-extrabold text-base sm:text-lg tracking-tight text-slate-800 flex items-center gap-1.5">
                DeutschKart
                <span className="hidden lg:inline text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  B1 Pro
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden lg:block">
                دولینگوی فارسی + باشگاه گرامر آلمانی
              </p>
            </div>
          </Link>

          {/* Desktop Quick Nav */}
          <nav className="hidden md:flex items-center gap-1.5">
            <Link
              href="/"
              className={`px-3 py-2 rounded-2xl text-xs lg:text-sm font-bold flex items-center gap-1.5 transition ${
                pathname === '/'
                  ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Home className="w-4 h-4" />
              دسته‌ها
            </Link>
            <Link
              href="/grammar"
              className={`px-3 py-2 rounded-2xl text-xs lg:text-sm font-bold flex items-center gap-1.5 transition ${
                pathname.startsWith('/grammar')
                  ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <BookOpenCheck className="w-4 h-4 text-indigo-500" />
              گرامر B1
            </Link>
            <Link
              href="/learn"
              className={`px-3 py-2 rounded-2xl text-xs lg:text-sm font-bold flex items-center gap-1.5 transition ${
                pathname.startsWith('/learn')
                  ? 'bg-sky-50 text-sky-700 border-2 border-sky-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Map className="w-4 h-4 text-sky-500" />
              مسیر B1
            </Link>
            <Link
              href="/starred"
              className={`px-3 py-2 rounded-2xl text-xs lg:text-sm font-bold flex items-center gap-1.5 transition ${
                pathname.startsWith('/starred')
                  ? 'bg-amber-50 text-amber-700 border-2 border-amber-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              ستاره‌دارها
              {starredIds.size > 0 && (
                <span className="bg-amber-400 text-white text-[11px] px-1.5 py-0.2 rounded-full font-extrabold">
                  {starredIds.size}
                </span>
              )}
            </Link>
            <Link
              href="/create"
              className={`px-3 py-2 rounded-2xl text-xs lg:text-sm font-bold flex items-center gap-1.5 transition ${
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Daily XP Pill */}
            {user && (
              <Link
                href="/learn"
                title={`امتیاز امروز: ${dailyXp} از ${dailyGoal} XP (مجموع: ${user.totalXp} XP)`}
                className={`flex items-center gap-1 rounded-2xl border-2 px-2 sm:px-2.5 py-1.5 font-de font-extrabold text-xs sm:text-sm transition ${
                  goalDone
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-sky-50 border-sky-200 text-sky-700'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${goalDone ? 'fill-emerald-500 text-emerald-500' : 'fill-amber-400 text-amber-500'}`} />
                <span>
                  {dailyXp}/{dailyGoal}
                </span>
              </Link>
            )}

            {/* Streak badge */}
            <div
              title={`زنجیره مطالعه: ${user?.streakCount ?? 0} روز · محافظ زنجیره: ${user?.streakFreezes ?? 2}`}
              className="flex items-center gap-1 rounded-2xl bg-amber-50 border-2 border-amber-200 px-2 sm:px-2.5 py-1.5 text-amber-600 font-de font-extrabold text-xs sm:text-sm"
            >
              <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-500 text-amber-500" />
              <span>{user?.streakCount ?? 0}</span>
            </div>

            {/* Settings / Account popover */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-sm font-bold text-slate-700 transition"
              >
                {user ? (
                  <>
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline max-w-[75px] truncate">{user.name}</span>
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline text-xs">ورود</span>
                  </>
                )}
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-72 rounded-3xl bg-white shadow-xl border-2 border-slate-100 p-4 z-50 space-y-3">
                    {user && (
                      <div className="rounded-2xl bg-gradient-to-l from-emerald-50 to-sky-50 border border-emerald-100 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-extrabold">
                          <span className="text-slate-700">مجموع XP تو:</span>
                          <span className="font-de text-emerald-700 font-black">
                            {user.totalXp} XP ⚡
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-extrabold">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Snowflake className="w-3.5 h-3.5 text-sky-500" />
                            محافظ زنجیره (Streak Freeze)
                          </span>
                          <span className="font-de text-sky-700 font-black">
                            {user.streakFreezes} عدد
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Daily Goal Selector */}
                    {user && (
                      <div className="space-y-1.5 p-2.5 rounded-2xl bg-slate-50">
                        <div className="text-xs font-extrabold text-slate-700">
                          🎯 هدف روزانه XP
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {DAILY_GOAL_OPTIONS.map((opt) => (
                            <button
                              key={opt.xp}
                              type="button"
                              onClick={() => setDailyGoal(opt.xp)}
                              className={`rounded-xl py-1.5 text-[11px] font-black transition ${
                                user.dailyGoal === opt.xp
                                  ? 'bg-emerald-500 text-white shadow-xs'
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

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

      {/* Mobile Bottom Navigation Bar (5 crisp items) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-slate-100 px-1.5 py-1.5 grid grid-cols-5 gap-0.5">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-extrabold ${
            pathname === '/' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>دسته‌ها</span>
        </Link>
        <Link
          href="/grammar"
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-extrabold ${
            pathname.startsWith('/grammar') ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'
          }`}
        >
          <BookOpenCheck className="w-5 h-5" />
          <span>گرامر B1</span>
        </Link>
        <Link
          href="/learn"
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-extrabold ${
            pathname.startsWith('/learn') ? 'text-sky-600 bg-sky-50' : 'text-slate-400'
          }`}
        >
          <Map className="w-5 h-5" />
          <span>مسیر B1</span>
        </Link>
        <Link
          href="/starred"
          className={`relative flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-extrabold ${
            pathname.startsWith('/starred') ? 'text-amber-600 bg-amber-50' : 'text-slate-400'
          }`}
        >
          <Star className="w-5 h-5" />
          <span>ستاره‌دار</span>
          {starredIds.size > 0 && (
            <span className="absolute top-0 right-2 bg-amber-400 text-white text-[9px] min-w-[15px] h-[15px] px-0.5 rounded-full flex items-center justify-center font-black">
              {starredIds.size}
            </span>
          )}
        </Link>
        <Link
          href="/create"
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-extrabold ${
            pathname.startsWith('/create') ? 'text-violet-600 bg-violet-50' : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span>ساخت AI</span>
        </Link>
      </nav>
    </>
  );
}
