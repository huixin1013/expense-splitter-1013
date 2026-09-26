import React from 'react';
import {
  Utensils,
  ShoppingBag,
  Car,
  Tv,
  Coffee,
  Zap,
  Receipt,
} from 'lucide-react';
import { ExpenseCategory } from '../types';

export interface CategoryMeta {
  id: ExpenseCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgLightClass: string;
  borderClass: string;
}

export const CATEGORIES: Record<ExpenseCategory, CategoryMeta> = {
  meal: {
    id: 'meal',
    label: 'Meals & Dining',
    icon: Utensils,
    colorClass: 'text-amber-700',
    bgLightClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  daily: {
    id: 'daily',
    label: 'Daily Expenses',
    icon: Coffee,
    colorClass: 'text-rose-700',
    bgLightClass: 'bg-rose-50',
    borderClass: 'border-rose-200',
  },
  groceries: {
    id: 'groceries',
    label: 'Groceries',
    icon: ShoppingBag,
    colorClass: 'text-emerald-700',
    bgLightClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  transport: {
    id: 'transport',
    label: 'Transport & Rides',
    icon: Car,
    colorClass: 'text-blue-700',
    bgLightClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment',
    icon: Tv,
    colorClass: 'text-purple-700',
    bgLightClass: 'bg-purple-50',
    borderClass: 'border-purple-200',
  },
  utilities: {
    id: 'utilities',
    label: 'Bills & Utilities',
    icon: Zap,
    colorClass: 'text-orange-700',
    bgLightClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
  },
  other: {
    id: 'other',
    label: 'Other',
    icon: Receipt,
    colorClass: 'text-slate-700',
    bgLightClass: 'bg-slate-50',
    borderClass: 'border-slate-200',
  },
};

export const POPULAR_EXPENSE_PRESETS = [
  { title: 'Dinner together', category: 'meal' as ExpenseCategory, defaultSplit: 'equal' as const },
  { title: 'Lunch meal', category: 'meal' as ExpenseCategory, defaultSplit: 'equal' as const },
  { title: 'Coffee & Drinks', category: 'daily' as ExpenseCategory, defaultSplit: 'equal' as const },
  { title: 'Supermarket Groceries', category: 'groceries' as ExpenseCategory, defaultSplit: 'equal' as const },
  { title: 'Taxi / Ride fare', category: 'transport' as ExpenseCategory, defaultSplit: 'equal' as const },
  { title: 'Movie tickets', category: 'entertainment' as ExpenseCategory, defaultSplit: 'equal' as const },
];
