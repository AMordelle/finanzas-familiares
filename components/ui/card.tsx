import { cn } from '@/lib/utils';
import * as React from 'react';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)} {...props} />;
}
