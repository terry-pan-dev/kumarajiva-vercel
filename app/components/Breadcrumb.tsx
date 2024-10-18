import { useMatches } from '@remix-run/react';
import { Icons } from './icons';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from './ui';

export function BreadcrumbLine() {
  const matches = useMatches();
  const breadcrumbs = matches
    .filter((match) => !(match.pathname === '/' || match.id.includes('index')))
    .map((match) => ({
      href: match.pathname,
      // name: match.pathname.replace('/', '').replace('translation', 'tripitaka').toUpperCase(),
      name: match.pathname.split('/').filter(Boolean).length === 1 ? 'Sutra' : 'Roll',
    }));
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((breadcrumb, index) => (
          <div key={index} className="flex items-center justify-center">
            <BreadcrumbItem>
              <BreadcrumbLink href={breadcrumb.href}>{breadcrumb.name}</BreadcrumbLink>
            </BreadcrumbItem>
            {index !== breadcrumbs.length - 1 && (
              <BreadcrumbSeparator className="pl-2">
                <Icons.ChevronRight />
              </BreadcrumbSeparator>
            )}
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
