'use client';

import { useState, useEffect } from 'react';
import { ModelConfig, getAvailableModels, getDefaultModel, GatewayModel } from '@/lib/providers';

interface ModelSelectorProps {
  value: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

export default function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [gatewayModels, setGatewayModels] = useState<GatewayModel[]>([]);
  const [isLoadingGateway, setIsLoadingGateway] = useState(false);

  // Fetch gateway models when gateway provider is selected
  useEffect(() => {
    if (value.provider === 'gateway') {
      // Only fetch if we don't have models yet
      if (gatewayModels.length === 0) {
        setIsLoadingGateway(true);
        fetch('/api/models')
          .then((res) => res.json())
          .then((data) => {
            if (data.models) {
              setGatewayModels(data.models);
              // If current model is not in the list, set to default
              if (!data.models.find((m: GatewayModel) => m.id === value.model)) {
                onChange({
                  provider: 'gateway',
                  model: getDefaultModel('gateway'),
                });
              }
            }
          })
          .catch((error) => {
            console.error('Failed to fetch gateway models:', error);
          })
          .finally(() => {
            setIsLoadingGateway(false);
          });
      }
    }
  }, [value.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderChange = (provider: 'anthropic' | 'openai' | 'gateway') => {
    onChange({
      provider,
      model: getDefaultModel(provider),
    });
  };

  const handleModelChange = (model: string) => {
    onChange({
      ...value,
      model,
    });
  };

  const availableModels = value.provider === 'gateway' 
    ? gatewayModels 
    : getAvailableModels(value.provider).map((id) => ({ id, name: id }));

  return (
    <div className="flex items-center gap-2">
      <select
        value={value.provider}
        onChange={(e) => handleProviderChange(e.target.value as 'anthropic' | 'openai' | 'gateway')}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
        <option value="gateway">Vercel Gateway</option>
      </select>
      <select
        value={value.model}
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={value.provider === 'gateway' && isLoadingGateway}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        {isLoadingGateway && value.provider === 'gateway' ? (
          <option>Loading models...</option>
        ) : (
          availableModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name || model.id}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

