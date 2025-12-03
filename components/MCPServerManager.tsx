'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Server, CheckCircle2, XCircle } from 'lucide-react';

interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface MCPServerStatus {
  name: string;
  status: 'success' | 'error';
  toolCount?: number;
  tools?: string[];
  error?: string;
}

export default function MCPServerManager() {
  const [servers, setServers] = useState<MCPServerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState<MCPServerConfig>({
    name: '',
    type: 'http',
    url: '',
  });

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const response = await fetch('/api/mcp');
      const data = await response.json();
      if (data.servers) {
        setServers(data.servers.map((s: any) => ({ ...s, status: 'success' })));
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  };

  const addServer = async () => {
    if (!newServer.name || (newServer.type === 'http' && !newServer.url)) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initialize',
          servers: [newServer],
        }),
      });

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        setServers([...servers, result]);
        setShowAddForm(false);
        setNewServer({ name: '', type: 'http', url: '' });
      } else {
        alert('Failed to add server');
      }
    } catch (error) {
      console.error('Failed to add server:', error);
      alert('Failed to add server');
    } finally {
      setLoading(false);
    }
  };

  const removeServer = async (serverName: string) => {
    if (!confirm(`Remove server ${serverName}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/mcp?server=${serverName}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setServers(servers.filter((s) => s.name !== serverName));
      } else {
        alert('Failed to remove server');
      }
    } catch (error) {
      console.error('Failed to remove server:', error);
      alert('Failed to remove server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">MCP Servers</h3>
          <span className="text-sm text-gray-400">
            ({servers.filter((s) => s.status === 'success').length} connected)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadServers}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-800 rounded border border-gray-700">
          <h4 className="text-white font-medium mb-3">Add MCP Server</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Server Name</label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="e.g., GitHub MCP"
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Transport Type</label>
              <select
                value={newServer.type}
                onChange={(e) =>
                  setNewServer({ ...newServer, type: e.target.value as 'stdio' | 'http' })
                }
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="http">HTTP</option>
                <option value="stdio">Stdio</option>
              </select>
            </div>
            {newServer.type === 'http' && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">Server URL</label>
                <input
                  type="text"
                  value={newServer.url || ''}
                  onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                  placeholder="https://api.example.com/mcp"
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
            {newServer.type === 'stdio' && (
              <>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Command</label>
                  <input
                    type="text"
                    value={newServer.command || ''}
                    onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                    placeholder="npx"
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Arguments (comma-separated)</label>
                  <input
                    type="text"
                    value={newServer.args?.join(', ') || ''}
                    onChange={(e) =>
                      setNewServer({
                        ...newServer,
                        args: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    placeholder="-y, @modelcontextprotocol/server-github"
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={addServer}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
              >
                Add Server
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewServer({ name: '', type: 'http', url: '' });
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {servers.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No MCP servers configured. Click "Add Server" to connect one.
          </p>
        ) : (
          servers.map((server) => (
            <div
              key={server.name}
              className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700"
            >
              <div className="flex items-center gap-3">
                {server.status === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <div>
                  <div className="text-white font-medium">{server.name}</div>
                  {server.status === 'success' && (
                    <div className="text-sm text-gray-400">
                      {server.toolCount || 0} tools available
                    </div>
                  )}
                  {server.status === 'error' && (
                    <div className="text-sm text-red-400">{server.error}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeServer(server.name)}
                disabled={loading}
                className="p-2 text-red-400 hover:bg-red-900/20 rounded disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

