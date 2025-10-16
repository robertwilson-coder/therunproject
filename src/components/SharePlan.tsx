import { useState, useEffect } from 'react';
import { Share2, X, Copy, Check, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface SharePlanProps {
  planId: string;
  onClose: () => void;
}

interface ShareLink {
  id: string;
  share_token: string;
  is_active: boolean;
  views_count: number;
  created_at: string;
}

export function SharePlan({ planId, onClose }: SharePlanProps) {
  const { user } = useAuth();
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    loadShareLinks();
  }, [planId]);

  const loadShareLinks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('plan_shares')
        .select('*')
        .eq('training_plan_id', planId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShareLinks(data || []);
    } catch (error) {
      console.error('Error loading share links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShareLink = async () => {
    if (!user) return;

    setCreating(true);
    try {
      const { error } = await supabase.from('plan_shares').insert({
        training_plan_id: planId,
        shared_by: user.id,
        is_active: true,
      });

      if (error) throw error;
      await loadShareLinks();
    } catch (error) {
      console.error('Error creating share link:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleLink = async (linkId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('plan_shares')
        .update({ is_active: !currentStatus })
        .eq('id', linkId);

      if (error) throw error;
      await loadShareLinks();
    } catch (error) {
      console.error('Error toggling link:', error);
    }
  };

  const handleCopyLink = async (token: string) => {
    const shareUrl = `${window.location.origin}/shared/${token}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/shared/${token}`;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-russian-violet flex items-center gap-2">
              <Share2 className="w-6 h-6" />
              Share Your Training Plan
            </h2>
            <button
              onClick={onClose}
              className="text-russian-violet hover:text-raspberry transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-russian-violet">
              Share your training plan with friends, coaches, or running partners. You can create multiple share links and deactivate them anytime.
            </p>
          </div>

          <button
            onClick={handleCreateShareLink}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-bittersweet text-white font-bold rounded-lg hover:bg-raspberry transition-colors disabled:opacity-50"
          >
            <Share2 className="w-5 h-5" />
            {creating ? 'Creating...' : 'Create New Share Link'}
          </button>

          <div>
            <h3 className="text-lg font-bold text-russian-violet mb-4">Your Share Links</h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bittersweet mx-auto"></div>
              </div>
            ) : shareLinks.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Share2 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-russian-violet text-opacity-60">No share links created yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shareLinks.map((link) => (
                  <div
                    key={link.id}
                    className="p-4 bg-white border-2 border-sunset rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              link.is_active ? 'bg-green-600' : 'bg-gray-400'
                            }`}
                          ></div>
                          <span className="font-semibold text-russian-violet">
                            {link.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-russian-violet text-opacity-60">
                          Created: {new Date(link.created_at).toLocaleDateString()} • Views: {link.views_count}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleLink(link.id, link.is_active)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          link.is_active
                            ? 'bg-gray-100 text-russian-violet hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {link.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>

                    {link.is_active && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                          <code className="flex-1 text-xs text-russian-violet break-all">
                            {getShareUrl(link.share_token)}
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyLink(link.share_token)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-sunset text-white font-medium rounded-lg hover:bg-bittersweet transition-colors"
                          >
                            {copiedToken === link.share_token ? (
                              <>
                                <Check className="w-4 h-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy Link
                              </>
                            )}
                          </button>
                          <a
                            href={getShareUrl(link.share_token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple bg-opacity-80 text-white font-medium rounded-lg hover:bg-opacity-100 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-pink-50 border border-orange-200 rounded-lg p-4">
            <h4 className="font-semibold text-russian-violet mb-2">Share on Social Media</h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const text = `Check out my training plan from The Run Project! 🏃`;
                  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                  window.open(url, '_blank');
                }}
                className="flex-1 px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
              >
                Twitter
              </button>
              <button
                onClick={() => {
                  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}`;
                  window.open(url, '_blank');
                }}
                className="flex-1 px-4 py-2 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition-colors"
              >
                Facebook
              </button>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-russian-violet">
              <span className="font-semibold">Privacy Note:</span> Anyone with an active share link can view your training plan. Deactivate links anytime to revoke access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
