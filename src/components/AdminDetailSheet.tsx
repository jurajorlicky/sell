import { ReactNode } from 'react';

interface AdminDetailSheetProps {
  children: ReactNode;
  footer?: ReactNode;
  header: ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  onBackdropClick?: () => void;
  zIndex?: string;
  desktopMaxHeight?: string;
  mobileHeight?: string;
  contentClassName?: string;
}

const maxWidthClass = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '4xl': 'sm:max-w-4xl',
  '6xl': 'sm:max-w-6xl',
};

export default function AdminDetailSheet({
  children,
  footer,
  header,
  maxWidth = '4xl',
  onBackdropClick,
  zIndex = 'z-[60]',
  desktopMaxHeight = 'sm:max-h-[92vh]',
  mobileHeight = 'h-[96dvh]',
  contentClassName = 'p-3 sm:p-6',
}: AdminDetailSheetProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-black/50 sm:items-center sm:px-4 sm:py-6`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onBackdropClick?.();
      }}
    >
      <div
        className={`flex ${mobileHeight} w-full ${maxWidthClass[maxWidth]} flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl sm:h-auto ${desktopMaxHeight} sm:rounded-2xl sm:border`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
          {header}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
