'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-green-600" />,
        info: <InfoIcon className="size-5 text-blue-600" />,
        warning: <TriangleAlertIcon className="size-5 text-yellow-600" />,
        error: <OctagonXIcon className="size-5 text-red-600" />,
        loading: <Loader2Icon className="size-5 animate-spin text-gray-600" />,
      }}
      style={
        {
          '--normal-bg': 'hsl(0 0% 100%)',
          '--normal-text': 'hsl(0 0% 18%)',
          '--normal-border': 'hsl(214.3 31.8% 91.4%)',
          '--border-radius': 'var(--radius)',
          '--success-bg': 'hsl(0 0% 100%)',
          '--success-text': 'hsl(0 0% 18%)',
          '--success-border': 'hsl(142 76% 73%)',
          '--error-bg': 'hsl(0 0% 100%)',
          '--error-text': 'hsl(0 0% 18%)',
          '--error-border': 'hsl(0 84% 80%)',
          '--warning-bg': 'hsl(0 0% 100%)',
          '--warning-text': 'hsl(0 0% 18%)',
          '--warning-border': 'hsl(48 96% 76%)',
          '--info-bg': 'hsl(0 0% 100%)',
          '--info-text': 'hsl(0 0% 18%)',
          '--info-border': 'hsl(199 89% 76%)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
