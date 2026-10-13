'use client';

import * as React from 'react';
import { Button } from '@/components/admin/ui/button';

type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <div className="text-center">
            <p className="font-medium">An error occurred</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Please try again or contact the support team.
            </p>
          </div>
          <Button variant="outline" onClick={this.handleRetry}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
