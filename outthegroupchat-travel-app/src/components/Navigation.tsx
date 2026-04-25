'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Search, Newspaper, Bell, User, Users, Calendar, Mail, LogOut, Menu, X, ChevronDown, MapPin, Shield, Target } from 'lucide-react';

export function Navigation() {
  const { data: session, status } = useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // Fetch notification count
  useEffect(() => {
    if (status === 'authenticated') {
      fetchNotifications();
    }
  }, [status]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?unreadOnly=true&limit=1');
      if (res.ok) {
        const data = await res.json();
        setNotificationCount(data.pagination?.total || 0);
      }
    } catch (error) {
      // silently handle notification fetch error
    }
  };

  const navLinks = [
    { href: '/intents', label: 'Intents', icon: <Target className="w-4 h-4" /> },
    { href: '/inspiration', label: 'Inspiration', icon: <Sparkles className="w-4 h-4" /> },
    { href: '/discover', label: 'Discover', icon: <Search className="w-4 h-4" /> },
    { href: '/checkins', label: 'Check-ins', icon: <MapPin className="w-4 h-4" /> },
    { href: '/feed', label: 'Feed', icon: <Newspaper className="w-4 h-4" /> },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="glass border-b border-otg-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo — Hybrid Exit mark (brand/logo/logo-mark.svg) */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <Image
                src="/logo-mark.svg"
                alt=""
                aria-hidden="true"
                width={26}
                height={40}
                priority
                className="h-9 w-auto transition-transform group-hover:-translate-y-0.5"
              />
              <span className="font-display font-bold text-xl hidden sm:block tracking-tight">
                <span className="text-otg-sodium">Out</span>
                <span className="text-otg-text-bright">TheGroupchat</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-link font-medium flex items-center gap-1.5"
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Auth Section */}
            <div className="flex items-center gap-2">
              {status === 'loading' ? (
                <div className="w-10 h-10 rounded-full skeleton" />
              ) : status === 'authenticated' ? (
                <>
                  {/* Notifications Bell */}
                  <Link
                    href="/notifications"
                    className="relative p-2 rounded-full hover:bg-otg-maraschino transition-colors"
                  >
                    <Bell className="w-6 h-6 text-otg-text-dim" />
                    {notificationCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 w-5 h-5 bg-otg-sodium text-otg-bg-dark text-xs font-bold rounded-full flex items-center justify-center">
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                    )}
                  </Link>

                  {/* Profile Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                      className="flex items-center gap-2 p-1.5 rounded-full hover:bg-otg-maraschino transition-colors"
                    >
                      <div className="avatar avatar-md">
                        {session.user?.image ? (
                          <Image
                            src={session.user.image}
                            alt={session.user.name || 'User'}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{session.user?.name?.[0] || 'U'}</span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-otg-text-dim transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {isProfileOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-56 card p-2 shadow-xl"
                        >
                          <div className="px-3 py-2 border-b border-otg-border">
                            <p className="font-semibold text-otg-text-bright truncate">
                              {session.user?.name}
                            </p>
                            <p className="text-sm text-otg-text-dim truncate">
                              {session.user?.email}
                            </p>
                          </div>
                          <div className="py-1">
                            <Link
                              href="/profile"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <User className="w-4 h-4" />
                              Profile
                            </Link>
                            <Link
                              href="/crew"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <Users className="w-4 h-4" />
                              Crew
                            </Link>
                            <Link
                              href="/meetups"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <Calendar className="w-4 h-4" />
                              Meetups
                            </Link>
                            <Link
                              href="/checkins"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <MapPin className="w-4 h-4" />
                              Check-ins
                            </Link>
                            <Link
                              href="/invitations"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <Mail className="w-4 h-4" />
                              Invitations
                            </Link>
                            <Link
                              href="/settings/privacy"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-otg-text-bright hover:bg-otg-bg-dark/60 hover:text-otg-sodium rounded-lg transition-colors"
                              onClick={() => setIsProfileOpen(false)}
                            >
                              <Shield className="w-4 h-4" />
                              Privacy Settings
                            </Link>
                          </div>
                          <div className="pt-1 border-t border-otg-border">
                            <button
                              onClick={() => signOut({ callbackUrl: '/' })}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-otg-danger hover:bg-otg-danger/10 rounded-lg transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                              Sign out
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/auth/signin" className="btn btn-ghost text-sm py-2">
                    Sign in
                  </Link>
                  <Link href="/auth/signup" className="btn btn-primary text-sm py-2">
                    Get started
                  </Link>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-otg-text-bright hover:bg-otg-maraschino transition-colors"
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-otg-border"
            >
              <div className="px-4 py-3 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-otg-text-bright hover:bg-otg-maraschino hover:text-otg-sodium transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span>{link.icon}</span>
                    {link.label}
                  </Link>
                ))}
                {status === 'authenticated' && (
                  <>
                    <div className="border-t border-otg-border my-2" />
                    <Link
                      href="/settings/privacy"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-otg-text-bright hover:bg-otg-maraschino hover:text-otg-sodium transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Shield className="w-4 h-4" />
                      Privacy settings
                    </Link>
                  </>
                )}
                {status !== 'authenticated' && (
                  <>
                    <div className="border-t border-otg-border my-2" />
                    <Link
                      href="/auth/signin"
                      className="block px-3 py-2 rounded-lg text-otg-text-bright hover:bg-otg-maraschino transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="block px-3 py-2 rounded-lg bg-otg-sodium text-otg-bg-dark font-semibold hover:bg-otg-sodium-400 transition-colors text-center"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Get started
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

export default Navigation;
