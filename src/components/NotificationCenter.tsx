import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  action_url: string | null;
  email_text: string | null;
  created_at: string;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const subscription = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  async function fetchNotifications() {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    setUnreadCount((data || []).filter(n => !n.read).length);
  }

  async function markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    await fetchNotifications();
  }

  async function markAllAsRead() {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return;
    }

    await fetchNotifications();
  }

  async function deleteNotification(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      console.error('Error deleting notification:', error);
      return;
    }

    await fetchNotifications();
  }

  async function clearReadNotifications() {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('read', true);

    if (error) {
      console.error('Error clearing read notifications:', error);
      return;
    }

    await fetchNotifications();
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      window.location.hash = notification.action_url;
      setIsOpen(false);
    }
  }

  function toggleEmailExpanded(notificationId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  }

  function getTypeColor(type: Notification['type']) {
    switch (type) {
      case 'success':
        return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      default:
        return 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
    }
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function renderMarkdown(text: string) {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === '---') {
        elements.push(<hr key={key++} className="my-4 border-gray-300 dark:border-gray-600" />);
      } else if (line.startsWith('## ')) {
        const text = line.substring(3);
        elements.push(
          <h2 key={key++} className="text-base font-bold text-gray-900 dark:text-white mt-4 mb-2">
            {text}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        const text = line.substring(4);
        elements.push(
          <h3 key={key++} className="text-sm font-bold text-gray-900 dark:text-white mt-3 mb-2">
            {text}
          </h3>
        );
      } else if (line.startsWith('* ')) {
        const text = line.substring(2);
        const formatted = formatInlineMarkdown(text);
        elements.push(
          <li key={key++} className="ml-4 text-xs text-gray-700 dark:text-gray-300 mb-1">
            {formatted}
          </li>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={key++} className="h-2" />);
      } else {
        const formatted = formatInlineMarkdown(line);
        elements.push(
          <p key={key++} className="text-xs text-gray-700 dark:text-gray-300 mb-2">
            {formatted}
          </p>
        );
      }
    }

    return elements;
  }

  function formatInlineMarkdown(text: string): JSX.Element[] {
    const parts: JSX.Element[] = [];
    let currentText = '';
    let i = 0;
    let key = 0;

    while (i < text.length) {
      if (text[i] === '*' && text[i + 1] === '*') {
        if (currentText) {
          parts.push(<span key={key++}>{currentText}</span>);
          currentText = '';
        }

        i += 2;
        let boldText = '';
        while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '*')) {
          boldText += text[i];
          i++;
        }

        if (i < text.length - 1) {
          parts.push(<strong key={key++} className="font-bold">{boldText}</strong>);
          i += 2;
        }
      } else {
        currentText += text[i];
        i++;
      }
    }

    if (currentText) {
      parts.push(<span key={key++}>{currentText}</span>);
    }

    return parts;
  }

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/20 transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-white/90 hover:text-white" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed md:absolute right-2 md:right-0 top-16 md:top-auto md:mt-2 w-[calc(100vw-1rem)] md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-[calc(100vh-5rem)] md:max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Notifications
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Mark all read</span>
                </button>
              )}
              {notifications.some(n => n.read) && (
                <button
                  onClick={clearReadNotifications}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:underline flex items-center gap-1"
                  title="Clear read notifications"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Clear read</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`p-4 transition-colors ${
                      notification.read
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-blue-50 dark:bg-blue-900/20'
                    } ${
                      notification.action_url
                        ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0" />
                          )}
                          <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                            {notification.title}
                          </h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                          {notification.message}
                        </p>

                        {notification.email_text && (
                          <div className="mt-2">
                            <button
                              onClick={(e) => toggleEmailExpanded(notification.id, e)}
                              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {expandedEmails.has(notification.id) ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  Hide email
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  View email
                                </>
                              )}
                            </button>

                            {expandedEmails.has(notification.id) && (
                              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="text-xs text-gray-700 dark:text-gray-300">
                                  {renderMarkdown(notification.email_text)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded transition-colors flex-shrink-0"
                        aria-label="Delete notification"
                        title="Delete"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
