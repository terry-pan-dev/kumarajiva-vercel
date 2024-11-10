import { useFetcher } from '@remix-run/react';
import { AlertCircle, Bell, CheckCircle, Info } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import type { Banner as BannerType } from './Banner';

export const AdminBannerForm = () => {
  const fetcher = useFetcher();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<BannerType['type']>('info');

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const message = formData.get('message') as string;
      fetcher.submit(
        {
          message,
          type,
          kind: 'create-banner',
        },
        {
          method: 'post',
        },
      );
    },
    [fetcher, type],
  );

  return (
    <fetcher.Form method="post" className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium text-gray-700">
          Banner Message
        </label>
        <textarea
          id="message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          rows={3}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Banner Type</label>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { type: 'info', icon: Info, label: 'Information' },
            { type: 'warning', icon: Bell, label: 'Warning' },
            { type: 'error', icon: AlertCircle, label: 'Error' },
            { type: 'success', icon: CheckCircle, label: 'Success' },
          ].map(({ type: bannerType, icon: Icon, label }) => (
            <div
              key={bannerType}
              className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 ${
                type === bannerType ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
              }`}
              onClick={() => setType(bannerType as BannerType['type'])}
            >
              <Icon className="mx-auto mb-2 h-6 w-6" />
              <input type="hidden" name="type" value={bannerType}></input>
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Add Banner
      </button>
    </fetcher.Form>
  );
};
