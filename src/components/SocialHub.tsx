import { useState, useEffect } from 'react';
import {
  X,
  Users,
  UserPlus,
  Search,
  TrendingUp,
  Trophy,
  Heart,
  MessageCircle,
  Share2,
  UserCheck,
  UserMinus,
  Check,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface SocialHubProps {
  onClose: () => void;
}

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string;
  status: string;
}

interface WorkoutShare {
  id: string;
  user_id: string;
  caption: string;
  workout_data: any;
  created_at: string;
  display_name: string;
  kudos_count: number;
  has_given_kudos: boolean;
}

interface TrainingGroup {
  id: string;
  name: string;
  description: string;
  race_name: string;
  race_date: string;
  member_count: number;
  is_member: boolean;
}

export function SocialHub({ onClose }: SocialHubProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'feed' | 'friends' | 'groups'>('feed');
  const [feed, setFeed] = useState<WorkoutShare[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'feed') loadFeed();
    if (activeTab === 'friends') loadFriends();
    if (activeTab === 'groups') loadGroups();
  }, [activeTab]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_workout_feed', { limit_count: 20 });

      if (error) throw error;

      const formattedFeed = data?.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        caption: item.caption,
        workout_data: item.workout_data,
        created_at: item.created_at,
        display_name: item.display_name || 'Runner',
        kudos_count: item.kudos_count || 0,
        has_given_kudos: item.has_given_kudos || false
      })) || [];

      setFeed(formattedFeed);
    } catch (err) {
      showToast('error', 'Failed to load activity feed');
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    setLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', user?.id)
          .eq('status', 'accepted'),
        supabase
          .from('friendships')
          .select('user_id')
          .eq('friend_id', user?.id)
          .eq('status', 'pending')
      ]);

      if (friendsRes.error) throw friendsRes.error;
      if (requestsRes.error) throw requestsRes.error;

      const friendIds = friendsRes.data?.map((f: any) => f.friend_id) || [];
      const requestIds = requestsRes.data?.map((r: any) => r.user_id) || [];

      let friendProfiles: any[] = [];
      let requestProfiles: any[] = [];

      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', friendIds);
        friendProfiles = profiles || [];
      }

      if (requestIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', requestIds);
        requestProfiles = profiles || [];
      }

      setFriends(friendProfiles.map((p: any) => ({
        id: p.user_id,
        display_name: p.display_name || 'Runner',
        avatar_url: p.avatar_url,
        status: 'accepted'
      })));

      setFriendRequests(requestProfiles.map((p: any) => ({
        id: p.user_id,
        display_name: p.display_name || 'Runner',
        avatar_url: p.avatar_url,
        status: 'pending'
      })));
    } catch (err) {
      showToast('error', 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('training_groups')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const groupIds = data?.map((g: any) => g.id) || [];
      let memberships: any[] = [];

      if (groupIds.length > 0) {
        const { data: memberData } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user?.id)
          .in('group_id', groupIds);
        memberships = memberData || [];
      }

      const memberGroupIds = new Set(memberships.map((m: any) => m.group_id));

      setGroups(data?.map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        race_name: g.race_name,
        race_date: g.race_date,
        member_count: g.member_count,
        is_member: memberGroupIds.has(g.id)
      })) || []);
    } catch (err) {
      showToast('error', 'Failed to load training groups');
    } finally {
      setLoading(false);
    }
  };

  const handleGiveKudos = async (shareId: string) => {
    try {
      const share = feed.find(s => s.id === shareId);
      if (!share) return;

      if (share.has_given_kudos) {
        const { error } = await supabase
          .from('kudos')
          .delete()
          .eq('workout_share_id', shareId)
          .eq('user_id', user?.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kudos')
          .insert({
            user_id: user?.id,
            workout_share_id: shareId,
            emoji: '👏'
          });

        if (error) throw error;
      }

      loadFeed();
    } catch (err) {
      showToast('error', 'Failed to update kudos');
    }
  };

  const handleAcceptFriend = async (friendId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('user_id', friendId)
        .eq('friend_id', user?.id);

      if (error) throw error;
      showToast('success', 'Friend request accepted!');
      loadFriends();
    } catch (err) {
      showToast('error', 'Failed to accept friend request');
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: user?.id,
          role: 'member'
        });

      if (error) throw error;
      showToast('success', 'Joined training group!');
      loadGroups();
    } catch (err) {
      showToast('error', 'Failed to join group');
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-primary-600 to-primary-500">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Users className="w-6 h-6" />
              Social & Community
            </h2>
            <button
              onClick={onClose}
              className="text-white/90 hover:text-white transition-colors p-2 hover:bg-white/20 rounded-lg"
              aria-label="Close social hub"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              activeTab === 'feed'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Activity Feed
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors relative ${
              activeTab === 'friends'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4 inline mr-2" />
            Friends
            {friendRequests.length > 0 && (
              <span className="absolute top-2 right-4 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {friendRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              activeTab === 'groups'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 inline mr-2" />
            Training Groups
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Coming Soon</h3>
            <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
              Social features are on the way! Soon you'll be able to connect with other runners, share workouts, and join training groups.
            </p>
          </div>
          {false && activeTab === 'feed' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-neutral-500">Loading activity...</div>
              ) : feed.length === 0 ? (
                <div className="text-center py-12">
                  <Share2 className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
                  <p className="text-neutral-600 dark:text-neutral-400">No activity yet</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
                    Add friends and share workouts to see activity here
                  </p>
                </div>
              ) : (
                feed.map((item) => (
                  <div key={item.id} className="card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-neutral-900 dark:text-white">
                          {item.display_name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500">
                          {formatTimeAgo(item.created_at)}
                        </p>
                      </div>
                    </div>

                    {item.caption && (
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.caption}</p>
                    )}

                    <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {item.workout_data.distance && (
                          <div>
                            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                              {item.workout_data.distance}km
                            </p>
                            <p className="text-xs text-neutral-500">Distance</p>
                          </div>
                        )}
                        {item.workout_data.duration && (
                          <div>
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">
                              {item.workout_data.duration}min
                            </p>
                            <p className="text-xs text-neutral-500">Duration</p>
                          </div>
                        )}
                        {item.workout_data.pace && (
                          <div>
                            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                              {item.workout_data.pace}
                            </p>
                            <p className="text-xs text-neutral-500">Pace</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                      <button
                        onClick={() => handleGiveKudos(item.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                          item.has_given_kudos
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${item.has_given_kudos ? 'fill-current' : ''}`} />
                        <span className="text-sm font-semibold">{item.kudos_count}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="space-y-6">
              {friendRequests.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">
                    Friend Requests ({friendRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {friendRequests.map((request) => (
                      <div key={request.id} className="card p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                          </div>
                          <p className="font-semibold text-neutral-900 dark:text-white">
                            {request.display_name}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptFriend(request.id)}
                            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            Accept
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">
                  Friends ({friends.length})
                </h3>
                {friends.length === 0 ? (
                  <div className="text-center py-8">
                    <UserPlus className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
                    <p className="text-neutral-600 dark:text-neutral-400">No friends yet</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
                      Search for runners to connect with
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {friends.map((friend) => (
                      <div key={friend.id} className="card p-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-2">
                          <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <p className="font-semibold text-neutral-900 dark:text-white text-sm">
                          {friend.display_name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-neutral-500">Loading groups...</div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
                  <p className="text-neutral-600 dark:text-neutral-400">No training groups yet</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
                    Be the first to create a training group
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-neutral-900 dark:text-white">{group.name}</h3>
                        {group.race_name && (
                          <p className="text-sm text-primary-600 dark:text-primary-400">
                            {group.race_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                          {group.member_count} members
                        </p>
                      </div>
                    </div>

                    {group.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                        {group.description}
                      </p>
                    )}

                    {!group.is_member && (
                      <button
                        onClick={() => handleJoinGroup(group.id)}
                        className="w-full btn-primary py-2"
                      >
                        <UserCheck className="w-4 h-4 inline mr-2" />
                        Join Group
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
