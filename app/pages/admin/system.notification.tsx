import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';

import type { BannerType } from '~/drizzle/tables/notification';

import { AdminBannerForm } from '../../components/AdminBannerForm';

export const SystemNotification = ({ banners }: { banners: BannerType[] }) => {
  const fetcher = useFetcher();

  return (
    <div>
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-lg font-bold text-gray-900 lg:text-2xl">Banner Management</h1>
        <AdminBannerForm />
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 lg:text-xl">Active Banners</h2>
        <div className="space-y-4">
          {banners.map((banner) => (
            <div key={banner.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex-1">
                <p className="text-sm text-gray-600">{banner.message}</p>
                <div className="mt-2 flex items-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      banner.type === 'info'
                        ? 'bg-blue-100 text-blue-800'
                        : banner.type === 'warning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : banner.type === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {banner.type}
                  </span>
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      banner.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {banner.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex items-center">
                <fetcher.Form method="post">
                  <input name="kind" type="hidden" value="toggle-banner" />
                  <input type="hidden" name="bannerId" value={banner.id} />
                  <button type="submit" className="px-3 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
                    {banner.active ? 'Deactivate' : 'Activate'}
                  </button>
                </fetcher.Form>
                <fetcher.Form method="post">
                  <input name="kind" type="hidden" value="delete-banner" />
                  <input type="hidden" name="bannerId" value={banner.id} />
                  <button type="submit" className="p-1 text-gray-400 hover:text-gray-500">
                    <X className="h-5 w-5" />
                  </button>
                </fetcher.Form>
              </div>
            </div>
          ))}
          {banners.length === 0 && <p className="py-4 text-center text-gray-500">No banners yet</p>}
        </div>
      </div>
    </div>
  );
};
