'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

interface TabsProps {
  children: ReactNode;
  defaultValue: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  children,
  defaultValue,
  value: controlledValue,
  onChange,
  className = '',
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const activeTab = controlledValue ?? uncontrolledValue;

  const setActiveTab = useCallback(
    (tab: string) => {
      setUncontrolledValue(tab);
      onChange?.(tab);
    },
    [onChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export function TabsList({ children, className = '', variant = 'default' }: TabsListProps) {
  const baseClasses = 'flex items-center gap-1';
  const variantClasses = {
    default: 'bg-slate-100 dark:bg-slate-800 p-1 rounded-lg',
    pills: 'gap-2',
    underline: 'border-b border-slate-200 dark:border-slate-700 gap-0',
  };

  return (
    <div
      role="tablist"
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  children: ReactNode;
  value: string;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  children,
  value,
  className = '',
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={`relative px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive
          ? 'text-slate-900 dark:text-white'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      } ${className}`}
    >
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-white dark:bg-slate-700 rounded-md shadow-sm"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

interface TabsContentProps {
  children: ReactNode;
  value: string;
  className?: string;
}

export function TabsContent({ children, value, className = '' }: TabsContentProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <motion.div
      role="tabpanel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default Tabs;
