'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from './settings-panel-head';

interface SafeMatrixConfig {
  homeserver_url: string;
  bot_user_id: string;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface BridgeRow {
  id: string;
  bridge: string;
  label: string;
  management_room_id: string | null;
  status: string;
}

const BRIDGE_TYPES = ['whatsapp', 'telegram', 'signal', 'instagram', 'custom'];

export function OmnichannelSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SafeMatrixConfig | null>(null);
  const [bridges, setBridges] = useState<BridgeRow[]>([]);
  const [homeserverUrl, setHomeserverUrl] = useState('');
  const [botUserId, setBotUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [bridgeType, setBridgeType] = useState('whatsapp');
  const [bridgeLabel, setBridgeLabel] = useState('');
  const [managementRoomId, setManagementRoomId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configResponse, bridgesResponse] = await Promise.all([
        fetch('/api/matrix/config', { cache: 'no-store' }),
        fetch('/api/matrix/bridges', { cache: 'no-store' }),
      ]);
      if (!configResponse.ok || !bridgesResponse.ok)
        throw new Error('request failed');
      const configPayload = await configResponse.json();
      const bridgesPayload = await bridgesResponse.json();
      const nextConfig = (configPayload.config ??
        null) as SafeMatrixConfig | null;
      setConfig(nextConfig);
      setBridges((bridgesPayload.bridges ?? []) as BridgeRow[]);
      if (nextConfig) {
        setHomeserverUrl(nextConfig.homeserver_url);
        setBotUserId(nextConfig.bot_user_id);
        setEnabled(nextConfig.enabled);
      }
    } catch {
      toast.error(t('settings.omnichannel.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/matrix/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeserver_url: homeserverUrl,
          bot_user_id: botUserId,
          access_token: accessToken,
          enabled,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      setAccessToken('');
      toast.success(t('settings.omnichannel.saved'));
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.omnichannel.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  }

  async function addBridge(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/matrix/bridges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bridge: bridgeType,
        label: bridgeLabel,
        management_room_id: managementRoomId,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(payload.error || t('settings.omnichannel.bridgeFailed'));
      return;
    }
    setBridgeLabel('');
    setManagementRoomId('');
    await load();
  }

  async function removeBridge(id: string) {
    const response = await fetch(`/api/matrix/bridges/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      toast.error(t('settings.omnichannel.bridgeDeleteFailed'));
      return;
    }
    setBridges((current) => current.filter((bridge) => bridge.id !== id));
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t('settings.omnichannel.title')}
        description={t('settings.omnichannel.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={saveConfig}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="matrix-homeserver">
                      {t('settings.omnichannel.homeserver')}
                    </Label>
                    <Input
                      id="matrix-homeserver"
                      type="url"
                      required
                      placeholder="https://matrix.example.com"
                      value={homeserverUrl}
                      onChange={(event) => setHomeserverUrl(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="matrix-user">
                      {t('settings.omnichannel.botUser')}
                    </Label>
                    <Input
                      id="matrix-user"
                      placeholder="@crm-bot:example.com"
                      value={botUserId}
                      onChange={(event) => setBotUserId(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="matrix-token">
                    {t('settings.omnichannel.accessToken')}
                  </Label>
                  <Input
                    id="matrix-token"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder={
                      config
                        ? t('settings.omnichannel.replaceToken')
                        : 'syt_...'
                    }
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                  />
                </div>
                <div className="border-border flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t('settings.omnichannel.syncEnabled')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('settings.omnichannel.syncHint')}
                    </p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
                {config ? (
                  <div className="bg-muted text-muted-foreground rounded-lg p-3 text-xs">
                    <p>
                      {t('settings.omnichannel.lastSync')}:{' '}
                      {config.last_sync_at
                        ? new Date(config.last_sync_at).toLocaleString()
                        : t('settings.omnichannel.never')}
                    </p>
                    {config.last_error ? (
                      <p className="text-destructive mt-1">
                        {config.last_error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {t('settings.omnichannel.verifySave')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold">
                {t('settings.omnichannel.bridges')}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('settings.omnichannel.bridgesHint')}
              </p>
              <form
                className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]"
                onSubmit={addBridge}
              >
                <select
                  value={bridgeType}
                  onChange={(event) => setBridgeType(event.target.value)}
                  className="border-input h-9 rounded-lg border bg-transparent px-3 text-sm"
                >
                  {BRIDGE_TYPES.map((bridge) => (
                    <option key={bridge} value={bridge}>
                      {bridge}
                    </option>
                  ))}
                </select>
                <Input
                  required
                  placeholder={t('settings.omnichannel.bridgeLabel')}
                  value={bridgeLabel}
                  onChange={(event) => setBridgeLabel(event.target.value)}
                />
                <Input
                  placeholder={t('settings.omnichannel.managementRoom')}
                  value={managementRoomId}
                  onChange={(event) => setManagementRoomId(event.target.value)}
                />
                <Button type="submit" variant="outline" disabled={!config}>
                  <Plus />
                  {t('common.add')}
                </Button>
              </form>
              <div className="mt-4 space-y-2">
                {bridges.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('settings.omnichannel.noBridges')}
                  </p>
                ) : (
                  bridges.map((bridge) => (
                    <div
                      key={bridge.id}
                      className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
                    >
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                        {bridge.bridge}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {bridge.label}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {bridge.management_room_id ||
                            t('settings.omnichannel.noManagementRoom')}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {bridge.status}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void removeBridge(bridge.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
