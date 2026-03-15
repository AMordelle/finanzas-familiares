import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import * as React from 'react';

const buttonVariants = cva('inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition', {
  variants: {
    variant: {
      default: 'bg-primaria text-white hover:bg-teal-700',
      outline: 'border border-slate-300 bg-white hover:bg-slate-100',
      ghost: 'hover:bg-slate-100'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}
