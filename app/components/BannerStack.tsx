import React from 'react';
import { Banner, type Banner as BannerType } from './Banner';

interface BannerStackProps {
  banners: BannerType[];
  onDismiss: (id: string) => void;
}

export const BannerStack: React.FC<BannerStackProps> = ({ banners, onDismiss }) => {
  const activeBanners = banners.filter((banner) => banner.active);

  return (
    <div className="flex flex-col">
      {activeBanners.map((banner) => (
        <Banner key={banner.id} banner={banner} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
