'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAdminToken, getAdminUser } from '@/lib/api-admin';
import { SidebarFooter, useSidebar } from '@/components/admin/ui/sidebar';
import { ChevronLeft } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/admin/ui/avatar';
import { LogOutIcon, ChevronsUpDown } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/admin/ui/sidebar';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';

type NavItem = {
  title: string;
  url: string;
  iconKey?: string;
};

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    iconKey: 'dashboard',
  },
  {
    title: 'Transaction',
    url: '/transaction',
    iconKey: 'transaction',
  },
  {
    title: 'Packages',
    url: '/packages',
    iconKey: 'package',
  },
  {
    title: 'Voucher',
    url: '/voucher',
    iconKey: 'voucher',
  },
  {
    title: 'Frame',
    url: '/frame',
    iconKey: 'frame',
  },
  {
    title: 'Devices',
    url: '/devices',
    iconKey: 'monitor',
  },
  {
    title: 'Settings',
    url: '/settings',
    iconKey: 'setting',
  },
];

function renderSidebarIcon(item: NavItem, isActive: boolean) {
  const src = isActive
    ? `/icon/icon-${item.iconKey}-active.svg`
    : `/icon/icon-${item.iconKey}.svg`;
  return (
    <Image
      src={src}
      alt={item.title}
      width={22}
      height={22}
      className="size-5.5 shrink-0 transition-all"
    />
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebar, state, isMobile } = useSidebar();

  // Baca admin yang login dari localStorage (client-side, hindari hydration mismatch).
  const [admin, setAdmin] = React.useState<{ name: string; email: string } | null>(
    null,
  );
  React.useEffect(() => {
    setAdmin(getAdminUser());
  }, []);

  const adminName = admin?.name || 'Admin';
  const adminEmail = admin?.email || '';
  const adminInitials =
    adminName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AD';

  const handleLogout = () => {
    clearAdminToken();
    router.push('/login');
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-14 border-b px-4">
        <div
          className={`flex h-full items-center gap-2 ${state === 'expanded' ? 'justify-between' : 'justify-center'}`}
        >
          <div
            className={`flex items-center gap-2 ${state === 'collapsed' ? 'cursor-pointer select-none' : ''}`}
            onClick={() =>
              !isMobile && state === 'collapsed' && toggleSidebar()
            }
            title={
              !isMobile && state === 'collapsed' ? 'Open Sidebar' : undefined
            }
          >
            <Image
              src="/favicon-32x32.png"
              alt="Glambot"
              width={26}
              height={26}
              className="shrink-0"
            />

            {state === 'expanded' && (
              <span className="animate-in fade-in text-base font-semibold tracking-tight text-black duration-200">
                Glambot
              </span>
            )}
          </div>

          {!isMobile && state === 'expanded' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground h-7 w-7 transition-colors focus-visible:ring-0"
              aria-label="Toggle Sidebar"
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 mb-2 text-[11px] font-medium tracking-wider uppercase">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.url || pathname.startsWith(`${item.url}/`);

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`h-10 text-[15px] leading-5.5 font-normal transition-colors ${
                        isActive
                          ? 'bg-sidebar-primary hover:bg-sidebar-primary hover:text-sidebar-primary-foreground rounded-[8px]! text-white!'
                          : 'text-sidebar-foreground hover:text-sidebar-primary hover:bg-transparent'
                      }`}
                    >
                      <Link href={item.url} className="flex items-center gap-3">
                        {renderSidebarIcon(item, isActive)}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="w-full justify-start gap-3 border-transparent bg-transparent px-2 hover:border-transparent hover:bg-transparent hover:text-current focus-visible:bg-transparent active:bg-transparent data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:text-current"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src="/avatar-placeholder.png" alt={adminName} />
                    <AvatarFallback className="bg-muted rounded-lg text-xs font-semibold">
                      {adminInitials}
                    </AvatarFallback>
                  </Avatar>

                  {state === 'expanded' && (
                    <div className="animate-in fade-in grid flex-1 text-left text-sm leading-tight duration-200">
                      <span className="text-foreground truncate font-semibold">
                        {adminName}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {adminEmail}
                      </span>
                    </div>
                  )}

                  {state === 'expanded' && (
                    <ChevronsUpDown className="text-muted-foreground ml-auto size-4 shrink-0" />
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side={state === 'collapsed' ? 'right' : 'top'}
                align={state === 'collapsed' ? 'center' : 'end'}
                className="w-56"
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-2 font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-foreground text-sm leading-none font-medium">
                      {adminName}
                    </p>
                    <p className="text-muted-foreground text-xs leading-none">
                      {adminEmail}
                    </p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer gap-2 py-2 text-sm"
                  onClick={handleLogout}
                >
                  <LogOutIcon className="size-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
