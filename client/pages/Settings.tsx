import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Save, AlertCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const [, setLocation] = useLocation();
  const [cookies, setCookiesState] = useState<Record<number, string>>(() => {
    try {
      const saved = sessionStorage.getItem('draft_cookies');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setCookies = (newCookies: Record<number, string>) => {
    setCookiesState(newCookies);
    try {
      sessionStorage.setItem('draft_cookies', JSON.stringify(newCookies));
    } catch {}
  };

  const [refreshInterval, setRefreshInterval] = useState(300);
  const [savingCookie, setSavingCookie] = useState<number | null>(null);
  const [showCookie, setShowCookie] = useState<Record<number, boolean>>({});
  const [newSourceDialog, setNewSourceDialog] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState({
    name: '',
    url: '',
    authType: 'none' as 'none' | 'cookie' | 'api',
  });

  // Queries
  const { data: sources, refetch: refetchSources } = trpc.sources.list.useQuery();
  const { data: intervalData } = trpc.settings.getRefreshInterval.useQuery();

  // Mutations
  const updateCookie = trpc.settings.updateCookie.useMutation({
    onSuccess: () => {
      toast.success('Cookie updated successfully');
      setSavingCookie(null);
      refetchSources();
    },
    onError: (error) => {
      toast.error(`Failed to update cookie: ${error.message}`);
      setSavingCookie(null);
    },
  });

  const updateInterval = trpc.settings.updateRefreshInterval.useMutation({
    onSuccess: () => {
      toast.success('Refresh interval updated');
    },
    onError: (error) => {
      toast.error(`Failed to update interval: ${error.message}`);
    },
  });

  const addSource = trpc.sources.create.useMutation({
    onSuccess: () => {
      toast.success('Source added successfully');
      setNewSourceForm({ name: '', url: '', authType: 'none' });
      setNewSourceDialog(false);
      refetchSources();
    },
    onError: (error) => {
      toast.error(`Failed to add source: ${error.message}`);
    },
  });

  const deleteSource = trpc.sources.delete.useMutation({
    onSuccess: () => {
      toast.success('Source deleted successfully');
      refetchSources();
    },
    onError: (error) => {
      toast.error(`Failed to delete source: ${error.message}`);
    },
  });

  const handleSaveCookie = (sourceId: number) => {
    const cookieValue = cookies[sourceId];
    if (!cookieValue || !cookieValue.trim() || cookieValue === '********') {
      toast.error('Please enter a valid new cookie value');
      return;
    }

    let finalCookie = cookieValue.trim();
    let cookieName = 'session';
    // Auto prepend session= for cookie-based sources if not present
    const source = sources?.find(s => s.id === sourceId);
    if (source && source.scrapingMethod !== 'api') {
      if (!finalCookie.includes('=')) {
        finalCookie = `session=${finalCookie}`;
      } else {
        cookieName = finalCookie.split('=')[0].trim();
      }
    }

    setSavingCookie(sourceId);
    updateCookie.mutate({
      sourceId,
      cookieValue: finalCookie,
      cookieName: cookieName,
    });
  };

  const handleIntervalChange = (newInterval: number) => {
    setRefreshInterval(newInterval);
    updateInterval.mutate({ interval: newInterval });
  };

  const handleAddSource = () => {
    if (!newSourceForm.name.trim() || !newSourceForm.url.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    addSource.mutate({
      name: newSourceForm.name,
      url: newSourceForm.url,
      requiresAuth: newSourceForm.authType !== 'none',
      scrapingMethod: newSourceForm.authType === 'api' ? 'api' : 'html',
    });
  };

  const handleDeleteSource = (sourceId: number) => {
    if (confirm('Are you sure you want to delete this source?')) {
      deleteSource.mutate({ sourceId });
    }
  };

  const authRequiredSources = sources?.filter(s => s.requiresAuth && s.scrapingMethod !== 'api') || [];
  const apiSources = sources?.filter(s => s.requiresAuth && s.scrapingMethod === 'api') || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="text-slate-600"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Refresh Interval */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Auto-Refresh Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-3 block">
                  Refresh Interval (seconds)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[60, 120, 300, 600, 900, 1800].map((interval) => (
                    <Button
                      key={interval}
                      variant={refreshInterval === interval ? 'default' : 'outline'}
                      onClick={() => handleIntervalChange(interval)}
                      className={refreshInterval === interval ? 'bg-sky-500 hover:bg-sky-600' : ''}
                    >
                      {interval === 60 ? '1 min' : interval === 120 ? '2 min' : interval === 300 ? '5 min' : interval === 600 ? '10 min' : interval === 900 ? '15 min' : '30 min'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Current interval: {refreshInterval} seconds ({Math.round(refreshInterval / 60)} minutes)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cookie Settings */}
        {authRequiredSources.length > 0 && (
          <Card className="mb-8 border-amber-200 bg-amber-50">
            <CardHeader>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <CardTitle className="text-amber-900">Authentication Required</CardTitle>
                  <p className="text-sm text-amber-700 mt-1">
                    These sources require login cookies to access product data
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {authRequiredSources.map((source) => (
                  <div key={source.id} className="border-t border-amber-100 pt-6 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{source.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{source.url}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                          Requires Auth
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSource(source.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-slate-600">
                        Enter your session cookie from {source.name} to enable data scraping
                      </p>
                      {source.hasCookie && (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          ✅ Cookie Saved
                        </Badge>
                      )}
                    </div>
                    <form className="space-y-2" onSubmit={(e) => e.preventDefault()}>
                      <div className="relative">
                        <input
                          type={showCookie[source.id] ? 'text' : 'password'}
                          autoComplete="off"
                          placeholder={`Enter a new cookie to replace the saved one...`}
                          value={cookies[source.id] !== undefined ? cookies[source.id] : (source.cookie || '')}
                          onChange={(e) => setCookies({ ...cookies, [source.id]: e.target.value })}
                          className="w-full font-mono text-xs p-3 pr-10 border border-slate-200 rounded bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCookie({ ...showCookie, [source.id]: !showCookie[source.id] })}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showCookie[source.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleSaveCookie(source.id)}
                        disabled={savingCookie === source.id || updateCookie.isPending}
                        className="bg-sky-500 hover:bg-sky-600 w-full"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {savingCookie === source.id ? 'Saving...' : source.hasCookie ? 'Update Cookie' : 'Save Cookie'}
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Keys */}
        <Card className="mb-8 border-sky-200 bg-sky-50">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" />
              <div>
                <CardTitle className="text-sky-900">API Keys</CardTitle>
                <p className="text-sm text-sky-700 mt-1">
                  Configure API keys for sources that support direct API access (better speed & reliability)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {(apiSources || [])
                .map((source) => (
                <div key={`api-${source.id}`} className="border-t border-sky-100 pt-6 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{source.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{source.url}</p>
                    </div>
                    <div className="flex gap-2">
                      {source.hasCookie && (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          ✅ API Key Saved
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">
                    Enter your API key for {source.name}
                  </p>
                  <form className="space-y-2" onSubmit={(e) => e.preventDefault()}>
                    <div className="relative">
                      <input
                        type={showCookie[source.id] ? 'text' : 'password'}
                        autoComplete="off"
                        placeholder={`Enter API key...`}
                        value={cookies[source.id] !== undefined ? cookies[source.id] : (source.cookie || '')}
                        onChange={(e) => setCookies({ ...cookies, [source.id]: e.target.value })}
                        className="w-full font-mono text-xs p-3 pr-10 border border-slate-200 rounded bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCookie({ ...showCookie, [source.id]: !showCookie[source.id] })}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showCookie[source.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleSaveCookie(source.id)}
                      disabled={savingCookie === source.id || updateCookie.isPending}
                      className="bg-sky-500 hover:bg-sky-600 w-full"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingCookie === source.id ? 'Saving...' : source.hasCookie ? 'Update API Key' : 'Save API Key'}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Public Sources Info */}
        <Card className="mb-8 border-emerald-200 bg-emerald-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-emerald-900">Sources</CardTitle>
              <Dialog open={newSourceDialog} onOpenChange={setNewSourceDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Source
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Stock Source</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Source Name</label>
                      <Input
                        placeholder="e.g., MyShop, AnotherStore"
                        value={newSourceForm.name}
                        onChange={(e) => setNewSourceForm({ ...newSourceForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Website URL</label>
                      <Input
                        placeholder="e.g., https://example.com"
                        value={newSourceForm.url}
                        onChange={(e) => setNewSourceForm({ ...newSourceForm, url: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Authentication Method</label>
                      <select
                        value={newSourceForm.authType}
                        onChange={(e) => setNewSourceForm({ ...newSourceForm, authType: e.target.value as any })}
                        className="w-full flex h-10 items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="none">None (Public Website)</option>
                        <option value="cookie">Cookie (Requires Login)</option>
                        <option value="api">API Key (Direct API Access)</option>
                      </select>
                    </div>
                    <Button
                      onClick={handleAddSource}
                      disabled={addSource.isPending}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {addSource.isPending ? 'Adding...' : 'Add Source'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources?.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-3 bg-white rounded border border-emerald-100">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{source.name}</p>
                      <p className="text-xs text-slate-500 truncate">{source.url}</p>
                    </div>
                  </div>
                  {source.requiresAuth && (
                    <Badge variant="outline" className="ml-2 flex-shrink-0 text-xs bg-amber-100 text-amber-800 border-amber-200">
                      Auth
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSource(source.id)}
                    className="ml-2 flex-shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 px-2"
                    title="Delete Source"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-sm text-emerald-700 mt-4">
              {sources && sources.length > 0
                ? `${sources.length} source${sources.length !== 1 ? 's' : ''} configured`
                : 'No sources configured yet'}
            </p>
          </CardContent>
        </Card>

        {/* How to Get Cookie */}
        <Card>
          <CardHeader>
            <CardTitle>How to Get Your Session Cookie</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="font-semibold text-slate-900 flex-shrink-0">1.</span>
                <span>Open the website in your browser and log in with your account</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-900 flex-shrink-0">2.</span>
                <span>Press <kbd className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">F12</kbd> to open Developer Tools, then go to the "Application" or "Storage" tab</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-900 flex-shrink-0">3.</span>
                <span>Find "Cookies" in the left sidebar and click on the website URL</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-900 flex-shrink-0">4.</span>
                <span>Look for a cookie named "session", "auth", or similar - copy its entire value</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-900 flex-shrink-0">5.</span>
                <span>Paste it in the field above and click "Save Cookie"</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
