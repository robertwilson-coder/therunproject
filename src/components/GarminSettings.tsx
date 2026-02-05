import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { Watch, Link, Unlink, RefreshCw, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface GarminConnection {
  id: string;
  garmin_user_id: string;
  connected_at: string;
  last_sync_at: string | null;
  auto_sync_workouts: boolean;
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function GarminSettings() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<GarminConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);

  useEffect(() => {
    loadConnection();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const garminStatus = params.get('garmin');
    const message = params.get('message');

    if (garminStatus === 'connected') {
      setSyncMessage('Successfully connected to Garmin Connect!');
      loadConnection();
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setSyncMessage(''), 5000);
    } else if (garminStatus === 'error') {
      setSyncMessage(`Error: ${message || 'Failed to connect to Garmin'}`);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  }, []);

  async function loadConnection() {
    try {
      const { data, error } = await supabase
        .from('garmin_connections')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setConnection(data);
    } catch (error) {
      logger.error('Error loading Garmin connection:', error);
    } finally {
      setLoading(false);
    }
  }

  async function connectGarmin() {
    const garminClientId = import.meta.env.VITE_GARMIN_CLIENT_ID;

    if (!garminClientId) {
      setSyncMessage('Garmin Connect is not configured. Please contact support.');
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    sessionStorage.setItem('garmin_code_verifier', codeVerifier);

    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/garmin-oauth-callback`;
    const returnUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const state = JSON.stringify({ userId: user?.id, returnUrl, codeVerifier });

    const authUrl = `https://connect.garmin.com/oauthConfirm?oauth_consumer_key=${garminClientId}&oauth_callback=${encodeURIComponent(redirectUri)}&oauth_signature_method=HMAC-SHA1`;

    window.location.href = authUrl;
  }

  async function disconnectGarmin() {
    if (!confirm('Are you sure you want to disconnect Garmin? Your synced workouts will remain, but future workouts will not be automatically synced.')) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('garmin_connections')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setConnection(null);
      setSyncMessage('Disconnected from Garmin Connect');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (error) {
      logger.error('Error disconnecting Garmin:', error);
      setSyncMessage('Failed to disconnect from Garmin Connect');
    } finally {
      setLoading(false);
    }
  }

  async function syncActivities() {
    try {
      setSyncing(true);
      setSyncMessage('Importing activities from Garmin...');

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/garmin-sync-activities`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to sync activities');
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSyncMessage(`Successfully imported ${result.synced_count} new activities from Garmin!`);
      await loadConnection();
      setTimeout(() => setSyncMessage(''), 5000);
    } catch (error) {
      logger.error('Error syncing activities:', error);
      setSyncMessage(error instanceof Error ? error.message : 'Failed to sync activities');
    } finally {
      setSyncing(false);
    }
  }

  async function toggleAutoPush(enabled: boolean) {
    try {
      setUpdatingSettings(true);
      const { error } = await supabase
        .from('garmin_connections')
        .update({ auto_sync_workouts: enabled })
        .eq('user_id', user?.id);

      if (error) throw error;

      setConnection(prev => prev ? { ...prev, auto_sync_workouts: enabled } : null);
      setSyncMessage(enabled
        ? 'Auto-sync enabled! Workouts will be pushed to your Garmin Connect calendar.'
        : 'Auto-sync disabled.');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (error) {
      logger.error('Error updating settings:', error);
      setSyncMessage('Failed to update settings');
    } finally {
      setUpdatingSettings(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center mb-6">
        <Watch className="w-6 h-6 text-orange-500 mr-2" />
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Garmin Connect Integration
        </h2>
      </div>

      {syncMessage && (
        <div className={`mb-4 p-4 rounded-lg ${
          syncMessage.includes('Error') || syncMessage.includes('Failed')
            ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
        }`}>
          <div className="flex items-center">
            {!syncMessage.includes('Error') && !syncMessage.includes('Failed') && (
              <Check className="w-5 h-5 mr-2" />
            )}
            <p>{syncMessage}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {!connection ? (
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Connect your Garmin account to sync workouts directly to your Garmin watch and import completed activities.
            </p>
            <button
              onClick={connectGarmin}
              className="flex items-center justify-center w-full bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Link className="w-5 h-5 mr-2" />
              Connect to Garmin Connect
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              You'll be redirected to Garmin to authorize access to your workouts and activities.
            </p>
          </div>
        ) : (
          <div>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
              <div className="flex items-center text-green-700 dark:text-green-400 mb-2">
                <Check className="w-5 h-5 mr-2" />
                <span className="font-semibold">Connected to Garmin Connect</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <p>User ID: {connection.garmin_user_id}</p>
                <p>Connected: {new Date(connection.connected_at).toLocaleDateString()}</p>
                {connection.last_sync_at && (
                  <p>Last Sync: {new Date(connection.last_sync_at).toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Auto-Sync Workouts
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Automatically push planned workouts to Garmin Connect
                    </p>
                  </div>
                  <button
                    onClick={() => toggleAutoPush(!connection.auto_sync_workouts)}
                    disabled={updatingSettings}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      connection.auto_sync_workouts ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                    } ${updatingSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        connection.auto_sync_workouts ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <button
                onClick={syncActivities}
                disabled={syncing}
                className="flex items-center justify-center w-full bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Importing...' : 'Import Activities from Garmin'}
              </button>

              <button
                onClick={disconnectGarmin}
                disabled={syncing}
                className="flex items-center justify-center w-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Unlink className="w-5 h-5 mr-2" />
                Disconnect Garmin
              </button>
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                How it works
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <li>• <strong>Push to Watch:</strong> Workouts sync directly to your Garmin Connect calendar and appear on your watch</li>
                <li>• <strong>Import Activities:</strong> Pull completed runs from Garmin into your training plan</li>
                <li>• <strong>Auto-Match:</strong> Activities are automatically matched to your planned workouts</li>
                <li>• <strong>Compatible Devices:</strong> Works with all Garmin watches that support structured workouts</li>
              </ul>
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                <p className="text-xs text-green-800 dark:text-green-300 font-medium">
                  <strong>Note:</strong> After syncing workouts, sync your Garmin device with Garmin Connect to download them to your watch.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
