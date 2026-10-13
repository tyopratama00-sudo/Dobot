'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/admin/ui/breadcrumb';
import { SidebarTrigger } from '@/components/admin/ui/sidebar';

import { Button } from '../ui/button';
import { Input } from '../ui/input';

function toLabel(segment: string) {
  // 1. Pecah kata berdasarkan karakter '-'
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildCrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((segment, index) => ({
    label: toLabel(segment),
    href: '/' + segments.slice(0, index + 1).join('/'),
    isLast: index === segments.length - 1,
  }));
}

export function DashboardHeader() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/40 bg-white/55 px-5 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <SidebarTrigger
          className="md:hidden"
          aria-label="Open Sidebar"
        />
        <Breadcrumb>
          <BreadcrumbList className="flex items-center">
            {' '}
            {crumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                <BreadcrumbItem className="flex items-center">
                  {' '}
                  {!crumb.isLast ? (
                    <BreadcrumbLink
                      href={crumb.href}
                      className={`text-foreground hover:text-foreground text-2xl transition-colors ${index < crumbs.length - 2 ? 'hidden md:block' : ''}`}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="text-muted-foreground text-lg">
                      {crumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>

                {!crumb.isLast && (
                  <BreadcrumbSeparator
                    className={`inline-flex translate-y-0.5 items-center justify-center ${
                      index < crumbs.length - 2 ? 'hidden md:block' : ''
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-64 md:w-80">
          <Input
            type="text"
            placeholder="Search for anything ..."
            className="h-9 w-full rounded-full border border-slate-300 bg-transparent pr-10 pl-4 text-sm text-slate-600 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400"
          />
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-700" />
        </div>

        {/* Notification Button */}
        <Button
          variant="outline"
          size="icon"
          className="size-9 rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 focus-visible:ring-0"
          aria-label="Notifications"
        >
          <Bell className="size-4.5" />
        </Button>
      </div>
    </header>
  );
}
