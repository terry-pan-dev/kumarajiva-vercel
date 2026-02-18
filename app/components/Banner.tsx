import { AlertCircle, Bell, CheckCircle, Info, X } from 'lucide-react';
import React from 'react';

import type { NotificationType } from '~/utils/constants';

export interface Banner {
  id: string;
  message: string;
  type: NotificationType;
  active: boolean;
}

interface BannerProps {
  banner: Banner;
  onDismiss: (id: string) => void;
}

const getBannerColors = (type: NotificationType) => {
  switch (type) {
    case 'info':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'warning':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'error':
      return 'bg-red-50 text-red-800 border-red-200';
    case 'success':
      return 'bg-green-50 text-green-800 border-green-200';
  }
};

export const Banner: React.FC<BannerProps> = ({ banner, onDismiss }) => {
  function getBannerIcon(type: string): React.ReactNode {
    switch (type) {
      case 'info':
        return <Info className="h-4 w-4" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4" />;
      case 'error':
        return <Bell className="h-4 w-4" />;
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
    }
  }

  return (
    <div className={`border-b bg-opacity-70 px-4 py-3 transition-all ${getBannerColors(banner.type)}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <p className="flex items-center gap-2 text-md font-medium">
          {getBannerIcon(banner.type)}
          {banner.message}
        </p>
        <button
          aria-label="Dismiss"
          onClick={() => onDismiss(banner.id)}
          className="p-1 transition-opacity hover:opacity-70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
